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
    console.log('images are', images);
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
                    if (post.id !== post_id[0]) {
                        db('posts').update({
                            id: post_id[0],
                            mainimg: `post_main${post_id[0]}.${ext}`
                        }).where({id: post.id})
                            .returning('*')
                            .then(data => {
                                post.mainimage = data[0];
                                console.log('UPDATED POST FOR WRONG ID, the data is ', data);
                            })
                            .catch(err=>{
                                console.log('tuka ne treba', err);
                            });
                    }
                    post.id = post_id[0];
                    console.log('path', mainimg.path);
                    let writer;
                    console.log('postmainimg', post.mainimage);
                    const postStream = fs.createWriteStream(mainimg.path).pipe(writer = S3FSImplementation.createWriteStream(post.mainimage));
                    postStream.on('error', (err) => {
                        if (err)
                            throw err;
                        console.log('Greska pri upload ', err);
                        db('posts')
                            .del()
                            .where({id: post.id})
                            .catch(err => {
                                console.log('greska pri brisenje post od baza', err);
                            });
                        return res.status(500).json('Error uploading post').end();
                    });
                    writer.on('error', (err) => {
                        db('posts')
                            .del()
                            .where({id: post.id})
                            .catch(err => {
                                console.log('greska pri brisenje post od baza', err);
                            });
                        console.log('greskaa', err);
                        return res.status(500).json('Error uploading post',err).end();
                    });
                    let queries = images.map((image, ctr) => {
                        let pext = image.name.slice((image.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
                        let pimage = `post_${post_id[0]}_img${ctr}.${pext}`;
                        return trx.insert({
                            image: pimage,
                            post_id: post_id[0]
                        })
                            .into('post_images')
                            .returning('*')
                            .then(response => {
                                let imgWriter;
                                console.log('postimage id :', response[0].id);
                                console.log('image path is ', image.path, 'name is', pimage);
                                const imageStream = fs.createWriteStream(image.path).pipe(imgWriter = S3FSImplementation.createWriteStream(pimage));
                                imageStream.on('error', (err) => {
                                    console.log('pimageStream error', err);
                                    db('post_image').del()
                                        .where({id: response[0].id})
                                        .catch(err => {
                                                console.log('greska', err);
                                            }
                                        );
                                    return;
                                });
                                imgWriter.on('error', (err) => {
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
                                imgWriter.on('finish',()=>{
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
                        .then(trx.commit)
                        .catch(trx.rollback);
                    writer.on('finish', () => {
                        console.log('writing finished');
                        return promises;
                    });

                })
                .then(response => {
                    return response;
                })
                .catch(err => {
                    console.log('tuke', err);
                    return res.status(500).json(err);
                });
        })
            .then(data => {
                return res.json(post).end();
            })
            .catch(err => {
                console.log('greska', err);
                return res.status(400).json(err);
            });
        });
};
module.exports = {
    uploadPOST: uploadPOST,
    getPosts: getPosts
};
function getFileExtension(filename) {
    let ext = filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    return !(ext !== 'png' && ext !== 'jpeg' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'tif' && ext !== 'gif');
}