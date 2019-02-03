const getPosts = (req, res, db) => {

    db('posts')
        .select('*')
        .then(posts => {
            return db('post_images')
                .select('*')
                .then(post_images => {
                    let Post = [{}, [{}]];
                    let postimages = [];
                    let ctr = 0;
                    let start = 0;
                    post_images.map((pimage, index) => {
                        if (pimage.post_id !== posts[ctr].id) {
                            Post[ctr] = [posts[ctr], postimages.slice(start, index)];
                            start = index;
                            ctr++;
                            postimages.push(pimage);
                        } else {
                            postimages.push(pimage);
                        }
                    });
                    Post[ctr] = [posts[ctr], postimages.slice(start)];
                    return res.status(200).json(Post);
                }).catch(err => console.log('er', err));
        })
        .catch(err => console.log('er', err));
};

async function uploadMain(A, B, fs, S3FSImplementation) {
    return new Promise(async (resolve, reject) => {
        let imagewriter;
        let imageStream = fs.createReadStream(A.path).pipe(imagewriter = S3FSImplementation.createWriteStream(B.mainimage));
        console.log('waiting here');
        let a = await onHandler(imagewriter);
        let b = await onHandler(imageStream);
        console.log('A IS ', a, 'B IS ', b);
        if (!a || !b) {
            resolve(0);
        }
        resolve(1);
    });
}
function onHandler(stream){
    return new Promise((resolve, reject) => {
        console.log('ulazi');
        stream.on('error', (err) => {
            resolve(0);
        });
        stream.on('finish', () => {
            resolve(1);
        });
    });
}
const uploadASYNC = async (req, res, db, moment, fs, S3FSImplementation) => {
    try {
        const types = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        const {title, sdesc, descr} = req.body;
        const {mainimg, images} = req.files;
        const post_date = moment(new Date(), 'DD-MM-YYYY').toDate();
        if (!title || !sdesc || !descr || !mainimg.name || images.length === 0) {
            console.log('Bad request');
            return res.status(400).json('Bad Request').end();
        }
        if (types.every((type) => type !== mainimg.type)) {
            console.log('Not a valid image type or extension HERE2', mainimg);
            return res.status(400).json('Bad Request').end();
        }
        let postImages = [];
        let piFlag = 0;
        for (let i of Object.keys(images)) {
            if (types.every(type => type !== images[i].type)) {
                console.log('image ', images[i].name, ' bad type');
                continue;
            }
            piFlag = 1;
            postImages.push(images[i]);
        }
        if (!piFlag) {
            console.log('No images were uploaded');
        }
        let post = {
            title: title,
            description: descr,
            shortdescription: sdesc,
            post_date: post_date,
            post_images: postImages
        };
        let maxid = await db('posts').max('id');
        maxid[0].max++;
        post.id = maxid[0].max;
        let ext = mainimg.name.slice((mainimg.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
        let mainimgname = `post_main${post.id}.${ext}`;
        post.mainimage = mainimgname;
        //no need to wait for this insert
        let postDB = await db('posts').insert({
            title: title,
            sdesc: post.shortdescription,
            descr: post.description,
            mainimg: post.mainimage,
            post_date: post.post_date
        }).returning('*').catch((err) => {
            throw err;
        });

        console.log(postDB[0].id, ' vs', post.id);
        if (postDB[0].id !== post.id) {
            db('posts').update({id: post.id}).where({id: post.id}).catch(err => {
                throw err
            });
        }
        console.log('waiting');
        let uploadmain = await uploadMain(mainimg, post, fs, S3FSImplementation);
        // let imagewriter;
        // let imageStream = fs.createReadStream(mainimg.path).pipe(imagewriter = S3FSImplementation.createWriteStream(post.mainimage));
        let ctr = 0;
        console.log('UPLOAD MAIN IS ', uploadmain);
        for await(let post_image of images) {
            let pimagewriter;

            ext = post_image.name.slice((post_image.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
            post_image.name = `post_${post.id}_img${ctr}.${ext}`;
            let imgquery = db('post_images').insert({image: post_image.name, post_id: post.id}).returning('*'), writer;
            let pimageStream = await fs.createReadStream(post_image.path).pipe(pimagewriter = S3FSImplementation.createWriteStream(post_image.name));
            pimageStream.on('error',(err)=>{
                throw err;
            });
            pimagewriter.on('error', (err) => {
                throw err;
            });
            await pimageStream.on('finish', () => {
                post.post_images = [];
                console.log('FINISHED ', post_image.name);
                post.post_images.push(post_image.name);
            });
            await pimagewriter.on('finish', () => {
                console.log('here first');
            });
            ctr++;
        }
        console.log('Final post is ', post);

    } catch (err) {
        console.log('greskata e:', err);
        return err;
    }
};
const uploadPOST = (req, res, db, moment, fs, S3FSImplementation) => {
    const types = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    const {title, sdesc, descr} = req.body;
    const {mainimg, images} = req.files;
    const post_date = moment(new Date(), 'DD-MM-YYYY').toDate();
    if (!title || !sdesc || !descr || !mainimg.name || images.length === 0) {
        console.log('enter all fields');
        return res.status(400).json('Bad Request');
    }
    if (types.every(type => mainimg.type !== type)) {
        console.log('Not a valid image');
        return res.status(400).json('Bad Request');
    }
    let ext = getFileExtension(mainimg.name);
    if (ext === false) {
        console.log('Not a valid image');
        return false;
    }
    let allow = 0;
    let acceptedFiles = [];
    for (let i of Object.keys(images)) {
        if (types.every(type => images[i].type !== type)) {
            console.log('Image not valid',images[i]);
            continue;
        }
        ext = getFileExtension(images[i].name);
        if (ext === false) {
            console.log('Image not valid lul');
            continue;
        }
        allow = 1;
        acceptedFiles.push(images[i]);
    }
    if (!allow) {
        return res.status(400).json('toa');
    }
    let post = {
        id: '',
        title:title,
        description:descr,
        shortdescription: sdesc,
        mainimage: '',
        post_date: post_date,
        post_images: []
    };
    db.transaction(trx => {
        return db('posts').max('id').then(response => {
            let maxid = response[0].max;
            maxid++;
            post.id = maxid;
            ext = mainimg.name.slice((mainimg.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
            let mainimgname = `post_main${maxid}.${ext}`;
            post.mainimage = mainimgname;
            return trx.insert({
                title: title,
                descr: descr,
                sdesc: sdesc,
                mainimg: mainimgname
            })
                .into('posts')
                .returning('id')
                .then(post_id => {
                    console.log('postid=', post_id[0], 'vs', post.id);
                    if (post.id !== post_id[0]) {
                        console.log('tuka ?');
                        db('posts').update({
                            id: post_id[0],
                            mainimg: `post_main${post_id[0]}.${ext}`
                        }).where({id: post_id[0]})
                            .returning('*')
                            .then(data => {
                                post.mainimage = `post_main${post_id[0]}.${ext}`;
                                console.log('UPDATED POST FOR WRONG ID, the data is ', `post_main${post_id[0]}.${ext}`);
                            })
                            .catch(err=>{
                                console.log('tuka ne treba', err);
                            });
                    }
                    post.id = post_id[0];
                    console.log('path', mainimg.path);
                    let writer;
                    console.log('postmainimg', post.mainimage, 'path is ',mainimg.path);
                    const postStream = fs.createReadStream(mainimg.path).pipe(writer = S3FSImplementation.createWriteStream(post.mainimage));
                    postStream.on('error', (err) => {
                        console.log('Greska pri upload ', err);
                        db('posts')
                            .del()
                            .where({id: post.id})
                            .catch(err => {
                                console.log('greska pri brisenje post od baza', err);
                            });
                        if (err)
                            throw err;
                        return res.status(500).json('Error uploading post').end();
                    });
                    writer.on('error', (err) => {
                        console.log('greskaa', err);
                        db('posts')
                            .del()
                            .where({id: post.id})
                            .catch(err => {
                                console.log('greska pri brisenje post od baza', err);
                            });
                        if (err) {
                            throw err;
                        }
                        return res.status(500).json('Error uploading post',err).end();
                    });
                    let queries = images.map((image, ctr) => {
                        console.log('vlage;');
                        let pext = image.name.slice((image.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
                        let pimage = `post_${post_id[0]}_img${ctr}.${pext}`;
                        return trx.insert({
                            image: pimage,
                            post_id: post_id[0]
                        })
                            .into('post_images')
                            .returning('*')
                            .then(response => {
                                console.log('vlage2;');
                                let imgWriter;
                                console.log('postimage id :', response[0].id);
                                console.log('image path is ', image.path, 'name is', pimage);
                                const imageStream = fs.createReadStream(image.path).pipe(imgWriter = S3FSImplementation.createWriteStream(pimage));
                                imageStream.on('error', (err) => {
                                    console.log('pimageStream error', err);
                                    db('post_image').del()
                                        .where({id: response[0].id})
                                        .catch(err => {
                                                console.log('greska1', err);
                                            }
                                        );
                                    if (err)
                                        throw err;
                                    return;
                                });
                                imgWriter.on('error', (err) => {
                                    console.log('UPLOADING PIMAGE ERROR', err);
                                    db('post_images')
                                        .del()
                                        .where({id:response[0].id}).catch(err=>{
                                        console.log('error deleting img',err);
                                    });
                                    if (err) {
                                        console.log('errror is', err);
                                        throw err;
                                    }
                                    return;
                                });
                                return imgWriter.on('finish',()=>{
                                    console.log('se finishira slika 0');
                                    post.post_images.push(response[0]);
                                    return response[0];
                                });
                            })
                            .catch(err => {
                                console.log(err, 'greskAKURVo');
                                return res.status(500).json('Error uploading post').end();
                            });
                    });
                    var promises = Promise.all(queries)
                        .then(((values) => {
                            console.log('aaa',values);// return values;
                            return trx.commit;
                            // return trx.commit();
                        }).catch(error => {
                            console.log(error);
                            return trx.rollback;
                        }));

                    return writer.on('finish', () => {
                        console.log('writing finished',promises);
                        return promises;
                    });
                })
                .then(response => {
                    return response;
                })
                .catch(err => {
                    console.log('tuke', err);
                    db('posts')
                        .del()
                        .where({id: post.id})
                        .catch(err => {
                            console.log('greska pri brisenje post od baza', err);
                        });
                    return res.status(500).json(err).end();
                });
        })
            .then(data => {
                console.log('se finishira prakjanje na post');
                return res.json(post).end();
            })
            .catch(err => {
                console.log('greska2', err);
                return res.status(400).json(err).end();

            });
        });
};
module.exports = {
    uploadPOST: uploadPOST,
    getPosts: getPosts,
    uploadASYNC: uploadASYNC
};
function getFileExtension(filename) {
    let ext = filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    return !(ext !== 'png' && ext !== 'jpeg' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'tif' && ext !== 'gif');
}