const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt-nodejs');
const cors = require('cors');
const knex = require('knex');
const moment = require('moment');
// const aws = require('aws-sdk');
const S3FS = require('s3fs');
const fs = require('fs');
const api = require('./apiKeys');
const S3FSImplementation = new S3FS('3x3macedonia', api);

const multiparty = require('connect-multiparty');
const urlExists = require('url-exists');

const posts = require('./controllers/posts/posts');
const ads = require('./controllers/ads/ads');
const sponsors = require('./controllers/sponsors/sponsors');
const db = knex({
    client: 'pg',//deka koristi PostgreSQL
    connection: {
        connectionString: process.env.DATABASE_URL,
        ssl: true,
    }
});
const app = express();
const multipartyMiddleware = multiparty();
//anythight that should go to S3 it is getting processed
// to multipartmiddleware, intercepts the file and saves it %temp% requiest.files.file obect,
// router.use(multipartMiddleware);
app.set('views', './views');
app.use(express.static('./public'));

app.engine('html', require('ejs').renderFile);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cors());
app.use(multiparty(multipartyMiddleware));

console.log('port', Number(process.env.PORT));
console.log('THE BUCKET IS', process.env.S3_BUCKET);

app.get('/', (req, res) => {
    //tuka treba da se renderira front-endot
    res.json('Hello world');
});
app.get('/aboutus', (req, res) => {
    db('aboutus')
        .select('*')
        .then(aboutusimages => {
            res.status(200).json(aboutusimages);
        }).catch(err => console.log(err));
});

app.get('/ads',(req,res)=>{ads.getAds(req,res,db);});
app.get('/ad/:id',(req,res)=>{ads.getAd(req,res,db,fs,S3FSImplementation)});
app.del('/ad/:id',(req,res)=>{ads.deleteAd(req, res, db, fs, S3FSImplementation);});
app.post('/uploadad',(req,res)=>{ads.uploadAd(req,res,db,urlExists,fs,S3FSImplementation);});//treba /ad da se vika

app.get('/posts',(req,res)=>{posts.getPosts(req,res,db)});
app.get('/post_image/:id/:m',(req,res)=>{posts.getImage(req,res,db,S3FSImplementation)});
app.post('/post',(req,res)=>{posts.uploadPost(req,res,db,moment,fs,S3FSImplementation)});
app.patch('/post/',(req,res)=>{posts.editPost(req,res,db,fs,S3FSImplementation)});
app.del('/post_image/:id',(req,res)=>{post.deletePostImage(req,res,db,fs,S3FSImplementation)});
app.del('/post',(req,res)=>{post.deletePost(req,res,db,fs,S3FSImplementation)});

app.get('/sponsors',(req,res)=>{sponsors.getSponsors(req, res, db);});
app.get('/sponsor/:id',(req,res)=>{sponsors.getSponsor(req, res, db, fs, S3FSImplementation);});
app.del('/sponsor/:id', (req, res) => {sponsors.deleteSponsor(req, res, db, S3FSImplementation);});
app.post('/uploadsponsor',(req,res)=>{sponsors.uploadSponsor(req, res, db, urlExists, fs, S3FSImplementation);})
app.post('/signin', (req, res) => {
    const {username, password} = req.body;
    db.select('hash', 'username')
        .where({username: username})
        .from('login')
        .then(data => {  //data sto se vratilo od prethodnoto( email, hash )
            if (bcrypt.compareSync(password, data[0].hash)) {
                return db.select('*')
                    .from('users')
                    .where('username', '=', username)
                    .then(user => {
                        res.json(user[0]);
                    })
                    .catch(err => res.status(400).json('Unable to get user'))
            }
            res.status(400).json('Wrong Credentials');
        })
        .catch(err => res.status(400).json('Wrong Credentials'));
});
//username, password
app.post('/register', (req, res) => {
    const {username, password} = req.body;
    const hash = bcrypt.hashSync(password);

    db.transaction(trx => {
        trx.insert({
            hash: hash,
            username: username
        })
            .into('login')
            .returning('username')
            .then(loginUsername => {
                return trx('users')
                    .returning('*')
                    .insert({
                        username: loginUsername[0]
                    })
                    .then(response => {
                        res.json(response[0]);
                    });
            })
            .then(trx.commit)
            .catch(trx.rollback);
    }).catch(err => res.status(400).json('Bad Request'));
});

app.listen(process.env.PORT || 3001, () => {
    console.log(`app is running on port ${process.env.PORT}`);
});
