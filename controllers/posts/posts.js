function onHandlerReturn(stream){
    return new Promise((resolve, reject) => {
        console.log('vlaga?');
        stream.on('error', (err) => {
            console.log('vlaga vo error');
            let reason = new Error(err);
            reject(0);
        });
        stream.on('finish', () => {
            console.log('vlaga vo finish');
             return resolve(stream);
        });
        console.log('b');
    });
}
function onHandler(stream){
    return new Promise((resolve, reject) => {
        console.log('stream ulazi');
        stream.on('error', (err) => {
            console.log('vlaga vo error');
            let reason = new Error(err);
            reject(reason);
        });
        stream.on('finish', () => {
            console.log('vlaga vo finish');
            resolve(1);
        });
    });
}
async function uploadMain(path, name, fs, S3FSImplementation) {
    return new Promise(async (resolve, reject) => {
        let imagewriter;
        let imageStream = fs.createReadStream(path).pipe(imagewriter = S3FSImplementation.createWriteStream(name));
        let a = await onHandler(imagewriter).catch(err => {
            console.log('error is fetched', err);
            return 0;
        });
        if (!a) {
            reject(0);
        }else{
            resolve(1);
        }
    });
}

const getPosts = async (req, res, db) => {
    let posts = await db('posts').select('*').catch(err => {
        console.log('greska ', err);
    });
    let data = [];
    for (let post of posts) {
        let local = {
            id: post.id,
            mainimage: post.mainimg,
            shortdescription: post.sdesc,
            description:post.descr,
            post_date:post.post_date,
            title:post.title,
        };
        let post_images = await db('post_images').select('*').where({post_id: post.id}).catch(err => {
            console.log('greska kaj postslii', err);
        });
        data.push([local, post_images]);
    }
    return res.json(data);
};
const getImage = (req, res, db, S3FSImplementation) => {
    const {id, m} = req.params;
    if (isNaN(id)) {
        console.log('pagja');
    }
    if (Number(m) === 1) {
        db('posts').select('mainimg')
            .where({id: id})
            .then(img => {
                let image = img[0].mainimg;
                let readStream = S3FSImplementation.createReadStream(image, 'utf-8');
                readStream.on('error', (err) => {
                    console.log('error postmains3', err);
                    return res.status(500).json('Error getting image');
                });
                return readStream.pipe(res);
            }).catch(err => {
            console.log('Error postMain', err);
            return res.status(500).json('Error getting image');
        });
    } else if (Number(m) === 0) {
        db('post_images').select('*').where({id: id}).then(img => {
            let image = img[0].image;
            let readStream = S3FSImplementation.createReadStream(image, 'utf-8');
            readStream.on('error', (err) => {
                console.log('error postmains3', err);
                return res.status(500).json('Error getting image');
            });
            return readStream.pipe(res);
        }).catch(err=>{
            console.log('aa', err);
            return res.status(500).json('Error getting image');
        });
    }else{
        return res.status(400).json('Bad Request');
    }
};
const editPost = async (req, res, db, fs, S3FSImplementation) => {
    try {
        const {id, title, shortdescription, description} = req.body;
        const {mainimage, post_images} = req.files;
        const types = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        console.log(mainimage, post_images);
        if (mainimage !== undefined && mainimage.name) {
            if (!types.every((type) => type !== mainimage.type)) {  //if everything is gucci
                let mi = await db('posts').select('mainimg').where({id: id}).catch(err => {
                    console.log('Post that is edited is not found');
                    throw new Error('Post that is edited is not found' + err);
                });
                mi = mi[0].mainimg;//old main image
                let ext = mainimage.name.slice((mainimage.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
                let nmi = `post_main${id}.${ext}`;//new main image
                S3FSImplementation.unlink(mi, async (err) => {
                    if (err) {
                        console.log('Main image not found during deleting of post!');
                        throw new Error('Main image not found during deleting of post!' + err);
                    }
                    let stream;
                    fs.createReadStream(mainimage.path).pipe(stream = S3FSImplementation.createWriteStream(nmi));
                    let b = await onHandler(stream);
                    if (b !== 1) {
                        console.log('Error while editing main image !');
                        throw new Error('Error while editing main image !' + b);
                    }
                    db('posts').update({mainimg: nmi})
                        .where({id: id})
                        .catch(err => {
                            console.log('error updating to db after sucessfull update on s3');
                            //shouldnt happen
                            throw new Error('error updating to db after sucessfull update on s3' + err);
                        });
                    console.log('main image uploaded');
                });
            } else {
                console.log('Mainimage type not valid');
                throw new Error('Type of main img not valid');
            }
        }
        let pimages;
        //da se proveri dali post_images.lengh === undefined
        if (post_images.length !== 0) {
            pimages = [];
            let ctr = 0;
            let ext;
            post_images.map(async (post_image) => {
                if (!types.every((type) => type !== post_image.type)) {//if its gucci
                    ext = post_image.name.slice((post_image.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
                    console.log('ctr is', ctr);//ctr not updating for some reason?
                    let imgquery = await db('post_images').insert({
                        image: `post_${id}_${ctr}.${ext}`,
                        post_id: id
                    })
                        .returning('*')
                        .catch(err => {
                            //shouldnt happen
                            console.log('Error uploading post_image while edit', err);
                            throw new Error('Error uploading post_image while edit' + err);
                        });
                    console.log('ctr is', ctr);//ctr not updating for some reason?
                    ctr++;
                    console.log('ctr after ++ is', ctr);
                    let uploadpostimg = await uploadMain(post_image.path, `post_${id}_${ctr}.${ext}`, fs, S3FSImplementation);
                    // console.log('finish is ', uploadpostimg, 'image is', imgquery)/;
                    if (!uploadpostimg) {
                        //if it isnt updated delete it from the db
                        db('post_images').del().where({id: imgquery[0].id}).catch(err => {
                            console.log('Error while deleting from db after insert in db, (FAILED UPLOAD on s3_)', err);
                            throw new Error('Error while deleting from db after insert in db, (FAILED UPLOAD on s3_)' + err);
                        });
                    }
                    pimages.push({
                        image: imgquery[0].image,
                        post_id: imgquery[0].post_id,
                        id: imgquery[0].id
                    });
                }
            });
        }
        if (title !== undefined && title) {
            console.log('title', title);
            await db('posts').update({title: title}).where({id: id}).catch(error => {
                console.log('Error updating title of post', error);
                throw new Error('Error updating title of post' + error);
            });
        }
        if (shortdescription !== undefined && shortdescription) {
            await db('posts').update({sdesc: shortdescription}).where({id: id}).catch(error => {
                console.log('Error updating shortdescription of post', error);
                throw new Error('Error updating shortdescription of post' + error);
            });
        }
        if (description !== undefined && description) {
            await db('posts').update({descr: description}).where({id: id}).catch(error => {
                //shouldnt happen
                console.log('Error updating description during update on post', error);
                throw error;
            });
        }
        const post = await db('posts').select('*').where({id: id})
            .catch(err => {
                throw err;
            });
        console.log('post is', post);
        return res.status(200).json(post);
    } catch (e) {
        console.log('greskata e', e);
        return res.status(500).json(e);
    }
};
const uploadPost = async (req, res, db, moment, fs, S3FSImplementation) => {
    try {
        const {title, shortdescription, description} = req.body;
        const {mainimage, post_images} = req.files;
        const types = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        const post_date = moment(new Date(), 'DD-MM-YYYY').toDate();
        if (!title || !shortdescription || !description || !mainimage.name || post_images.length === 0) {
            console.log('Bad request');
            return res.status(400).json('Bad Request').end();
        }
        console.log('mainimg', mainimage, 'pimages', post_images);
        if (types.every((type) => type !== mainimage.type)) {
            console.log('Not a valid image type1', mainimage);
            return res.status(400).json('Bad Request').end();
        }
        let postImages = [];
        let piFlag = 0;
        console.log('POST IMAGES ARE', post_images.length);
        if (post_images.length === undefined) {
            console.log('vlaga tuka', post_images);
            if (!types.every(type => type !== post_images.type)) {
                postImages.push(post_images);
                console.log('se dodava', postImages);
                piFlag = 1;
            }
        } else {
            console.log('vlaga tuka2', post_images);

            for (let i of Object.keys(post_images)) {
                if (types.every(type => type !== post_images[i].type)) {
                    console.log('Not a valid image type', post_images[i].name);
                    continue;
                }
                piFlag = 1;
                postImages.push(post_images[i]);
            }
        }
        if (!piFlag) {
            console.log('No images were uploaded');
        }
        let post = {
            title: title,
            description: description,
            shortdescription: shortdescription,
            post_date: post_date,
        };
        let maxid = await db('posts').max('id');
        maxid[0].max++;
        post.id = maxid[0].max;
        let ext = mainimage.name.slice((mainimage.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
        let mainimgname = `post_main${post.id}.${ext}`;
        post.mainimage = mainimgname;
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
            console.log('ulazi tue');
            post.id = postDB[0].id;
            let updatedpost = `post_main${post.id}.${ext}`;
            await db('posts').update({mainimg: updatedpost}).where({id: post.id}).catch(err => {
                console.log('gresi kaj update na post');
                throw err
            });
            post.mainimage = updatedpost;
        }
        let uploadmain = await uploadMain(mainimage.path, post.mainimage, fs, S3FSImplementation);
        if (!uploadmain) {
            db('posts').del().where({id: post.id}).catch(err => {
                console.log('gresi pri delete na post');
                throw err;
            });
            return res.status(500).json('Error uploading post').end();
        }
        let ctr = 0;
        let pimages = [];
        console.log('tuka stiga!!', post_images, 'vs', postImages);
        for await(let post_image of postImages) {
            console.log('i', post_image);
            ext = post_image.name.slice((post_image.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
            post_image.name = `post_${post.id}_img${ctr}.${ext}`;
            let imgquery = await db('post_images').insert({
                image: post_image.name,
                post_id: post.id
            }).returning('*').catch(err => {
                console.log('greska pri dodavanje na post_image');
                throw err;
            });
            let uploadpostimg = await uploadMain(post_image.path, post_image.name, fs, S3FSImplementation);
            console.log('finish is ', uploadpostimg);
            if (!uploadpostimg) {
                db('post_images').del().where({id: imgquery[0].id}).catch(err => {
                    console.log('gresi pri delete na post_image');
                    throw err;
                });
                continue;
            }
            pimages.push({
                id: imgquery[0].id,
                post_image: imgquery[0].image,
                post_id: imgquery[0].post_id
            });
            ctr++;
        }
        return res.status(200).json([post, pimages]);
    }catch (err) {
        console.log('greskata e:', err);
        return res.status(400).json('Bad Request');
    }
};
module.exports = {
    getPosts: getPosts,
    uploadPost: uploadPost,
    getImage: getImage,
    editPost:editPost
};
function getFileExtension(filename) {
    let ext = filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    return !(ext !== 'png' && ext !== 'jpeg' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'tif' && ext !== 'gif');
}