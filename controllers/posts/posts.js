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
    console.time('pocetok');
    console.time('pocetok1');
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
    console.timeEnd('pocetok');
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
    let post = {
        id: '',
        title:title,
        description:descr,
        shortdescription: sdesc,
        mainimage: '',
        post_date: post_date,
        post_images: []
    };
    console.timeEnd('pocetok1');
    db.transaction(trx => {
        return db('posts').max('id').then(response => {
            console.log('maxid', response);
            let maxid = response[0].max;
            maxid++;
            post.id = maxid;
            ext = mainimg.name.slice((mainimg.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
            let mainimgname = `post_main${maxid}.${ext}`;
            post.mainimage = mainimgname;
            console.log('this is the name of the post', post.mainimage);
            console.log('name is', mainimgname);
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
                                console.log('UPDATED POST FOR WRONG ID, the data is ', data);
                            });
                    }
                    post.id = post_id[0];
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
                                post.post_images.push(response[0]);
                                return response[0];
                            })
                            .catch(err => {
                                console.log(err, 'greskAKURVo');
                                return res.status(500).json('Error uploading post').end();
                            });
                    });
                    var promises = Promise.all(queries)
                        .then(trx.commit)
                        .catch(trx.rollback);
                    return promises;
                })
                .then(response => {
                    return response;
                })
                .catch(err => {
                    console.log('tuke', err);
                });
        })
            .then(data => {
                console.log('dada', data);
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