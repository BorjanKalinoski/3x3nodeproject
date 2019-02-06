const getPosts = async (req, res, db) => {
    let posts = await db('posts').select('*').catch(err => {
        console.log('greska ', err);
    });
    console.log('posts are', posts);
    // posts = posts[0];
    let data = [];
    for (let post of posts) {
        console.log('POST IS ', post);
        let post_images = await db('post_images').select('*').where({post_id: post.id}).catch(err => {
            console.log('greska kaj postslii');
        });
        data.push([post, post_images]);
    }
    console.log('FULL DATA IS ', data);
    return res.json(data);
};
const getImage = async (req, res, db,S3FSImplementation) => {
    const id = req.params;
    const img = await db('posts').select('mainimg').where({id: id});
    console.log('img', img);
    const readStream = await onHandlerReturn(S3FSImplementation.createReadStream(img[0], 'utf-8'));
    console.log('readstream is', readStream);
    if (!readStream) {
        console.log('ulazi');
        return false;
    }
    return readStream.pipe(res);
};
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
function onHandlerReturn(stream){
    return new Promise((resolve, reject) => {
        stream.on('error', (err) => {
            console.log('vlaga vo error');
            let reason = new Error(err);
            reject(0);
        });
        stream.on('finish', () => {
            console.log('vlaga vo finish');
            resolve(stream);
        });
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
const uploadPost = async (req, res, db, moment, fs, S3FSImplementation) => {
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
            console.log('Not a valid image type', mainimg);
            return res.status(400).json('Bad Request').end();
        }
        let postImages = [];
        let piFlag = 0;
        for (let i of Object.keys(images)) {
            if (types.every(type => type !== images[i].type)) {
                console.log('Not a valid image type', images[i].name);
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
        };
        let maxid = await db('posts').max('id');
        maxid[0].max++;
        post.id = maxid[0].max;
        let ext = mainimg.name.slice((mainimg.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
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
        let uploadmain = await uploadMain(mainimg.path, post.mainimage, fs, S3FSImplementation);
        if (!uploadmain) {
            db('posts').del().where({id: post.id}).catch(err => {
                console.log('gresi pri delete na post');
                throw err;
            });
            return res.status(500).json('Error uploading post').end();
        }
        let ctr = 0;
        post.post_images = [];
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
            post.post_images.push({
                id: imgquery[0].id,
                post_image: imgquery[0].image,
                post_id: imgquery[0].post_id
            });
            ctr++;
        }
        console.log('Final post is ', post);
        return res.status(200).json(post);
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