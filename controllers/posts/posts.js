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
const uploadPOST = (req, res, db, moment) => {
    const types = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    const {title, sdesc, descr, post_date} = req.body;
    const {mainimg, images} = req.files;

    // console.log('SLIKA E ', images);
    // console.log(title, sdesc, descr, mainimg.name, images, post_date);
    // if (!moment(post_date).isValid()) {
    //     console.log('dateerror');
    //     res.status(400).json('Bad request');
    //     return;
    // }
    // console.log('pdate', post_date);
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
            console.log('Image not valid');
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
    db.transaction(trx => {
        return trx.insert({
            title: title,
            descr: descr,
            sdesc: sdesc,
            mainimg: mainimg.name
        })
            .into('posts')
            .returning('id')
            .then(post_id => {
                let a = images.map(image => {
                    console.log('POST ID', post_id[0]);
                    return trx.insert({
                        image: image.name,
                        post_id: post_id[0]
                    })
                        .into('post_images');
                });
                console.log('promises;', a);
                var d = Promise.all(a).then(trx.commit)
                    .then(trx.rollback);
                console.log('mine', d);
                // Promise.all(a).then();
            }).catch(err=>{
                console.log('tuke', err);});
    }).then(data => {
        console.log('dita', data);
        return res.json('GOOD').end();
    })
        .catch(err => {
            console.log('greska', err);
            return res.status(400).json(err);
        });
};
module.exports = {
    uploadPOST: uploadPOST,
    getPosts: getPosts
};
function getFileExtension(filename) {
    let ext= filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    return !(ext !== 'png' && ext !== 'jpeg' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'tif' && ext !== 'gif');
}