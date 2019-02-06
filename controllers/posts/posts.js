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
            description:post.description,
            post_date:post.post_date,
            title:post.title,
        };
        console.log('POST IS ', post);
        let post_images = await db('post_images').select('*').where({post_id: post.id}).catch(err => {
            console.log('greska kaj postslii', err);
        });
        data.push([local, post_images]);
    }
    return res.json(data);
};
const getImage = (req, res, db, S3FSImplementation) => {
    const {id, m} = req.params;
    console.log('main ', m, 'id ', id);
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
        console.log('vlage tuke');
        db('post_images').select('*').where({id: id}).then(img => {
            let image = img[0].image;
            let readStream = S3FSImplementation.createReadStream(image, 'utf-8');
            readStream.on('error', (err) => {
                console.log('error postmains3', err);
                return res.status(500).json('Error getting image');
            });
            return readStream.pipe(res);
        }).catch(err=>{
            console.log(err);
            return res.status(500).json('Error getting image');
        });
    }else{


        return res.status(400).json('Bad Request');
    }
};

const uploadPost = async (req, res, db, moment, fs, S3FSImplementation) => {
    try {
        const types = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        const {title, shortdescription, description} = req.body;
        const {mainimage, post_images} = req.files;
        const post_date = moment(new Date(), 'DD-MM-YYYY').toDate();
        if (!title || !shortdescription || !description || !mainimage.name || post_images.length === 0) {
            console.log('Bad request');
            return res.status(400).json('Bad Request').end();
        }
        console.log('mainimg', mainimage);
        if (types.every((type) => type !== mainimage.type)) {
            console.log('Not a valid image type', mainimage);
            return res.status(400).json('Bad Request').end();
        }
        let postImages = [];
        let piFlag = 0;
        for (let i of Object.keys(post_images)) {
            if (types.every(type => type !== post_images[i].type)) {
                console.log('Not a valid image type', post_images[i].name);
                continue;
            }
            piFlag = 1;
            postImages.push(post_images[i]);
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
        for await(let post_image of postImages) {
            ext = post_image.name.slice((post_image.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
            post_image.name = `post_${post.id}_img${ctr}.${ext}`;
            let imgquery = await db('post_images').insert({image: post_image.name, post_id: post.id}).returning('*');
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
        console.log('Final post is ', post, pimages);
        return res.status(200).json([post, pimages]);
    } catch (err) {
        console.log('greskata e:', err);
        return res.status(400).json('Bad Request');
    }
};
module.exports = {
    getPosts: getPosts,
    uploadPost: uploadPost,
    getImage: getImage
};
function getFileExtension(filename) {
    let ext = filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    return !(ext !== 'png' && ext !== 'jpeg' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'tif' && ext !== 'gif');
}