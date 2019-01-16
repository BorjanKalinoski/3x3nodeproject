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
    console.log('da');
    console.log(req);
    const {title, sdesc, descr, mainimg, images, post_date} = req.body;
    console.log(req.files);
    return res.json(req.body).end();
};
const uploadPost = (req, res, db, moment) => {
    const {title, sdesc, descr, mainimg, images, post_date} = req.body;
    // console.log(req.body);
    if (!moment(post_date).isValid()) {
        console.log('dateerror');
        res.status(400).json('Bad request');
        return;
    }
    if (!title || !sdesc || !descr || !mainimg.name || images.length === 0) {
        console.log('serror');
        res.status(400).json('Bad request');
        return;
    }
    if (mainimg.type.substr(0, 5) !== 'image') {
        res.status(400).json('Bad request');
        return;
    }
    if (getFileExtension(mainimg.name) === false) {
        res.status(400).json('Bad request');
        return;
    }
    let postimages = [];
    for (let i in images) {
        if (images[i].type.substr(0, 5) !== 'image') {
            return res.status(400).json('Bad request');
        }
        if (getFileExtension(images[i].name) === false) {
            return res.status(400).json('Bad request');
        }
        postimages.push(images[i].name.toLowerCase());
    }

    db.transaction(trx => {
        const queries = [];
        const main = trx.insert({
            title: title,
            sdesc: sdesc,
            descr: descr,
            mainimg: mainimg.name,
            post_date: post_date
        })
            .into('posts')
            .returning('id')
            .then(post_id => {
                postimages.forEach(image => {
                    trx('post_images')
                        .insert({
                            post_id: post_id[0],
                            image: image
                        }).then(response => {
                        res.json(response[0]);
                    });
                });
            });
        queries.push(main);
        Promise.all(queries).then(trx.commit)
            .catch(trx.rollback)
    }).catch(err => {
        console.log(err);
        res.status(400).json('Bad Request');
    });
    res.status(200).json('Post Submitted');
};
module.exports = {
    uploadPost: uploadPOST,
    getPosts: getPosts
};
function getFileExtension(filename) {
    let ext= filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    return !(ext !== 'png' && ext !== 'jpeg' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'tif' && ext !== 'gif');
}