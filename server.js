const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt-nodejs');
const cors = require('cors');
const knex = require('knex');
const moment = require('moment');
const upload = require('express-fileupload');
const urlExists = require('url-exists');

const posts = require('./controllers/posts/posts');
const ads = require('./controllers/ads/ads');

const db =knex({
    client: 'pg',//deka koristi PostgreSQL
    connection: {
        host : '127.0.0.1',
        user : 'postgres',
        password : '',
        database : 'postgres'
    }
});
const app=express();

app.use(bodyParser.json());
app.use(cors());
app.use(upload());
app.get('/sponsors',(req,res)=>{
   db('sponsors')
       .select('*')
       .then(sponsors=>{
           res.status(200).json(sponsors);
       }).catch(err=>console.log(err));
});
app.get('/aboutus',(req,res)=>{
    db('aboutus')
        .select('*')
        .then(aboutusimages=>{
            res.status(200).json(aboutusimages);
        }).catch(err=>console.log(err));
});

app.get('/ad/:id',(req,res)=>{ads.getAd(req,res,db)});
app.get('/ads',(req,res)=>{ads.getAds(req,res,db);});
app.post('/uploadad',(req,res)=>{ads.uploadAd(req,res,db,urlExists);});
app.post('/post',(req,res)=>{posts.uploadPost(req,res,db,moment)});
app.get('/getposts',(req,res)=>{posts.getPosts(req,res,db)});

app.post('/signin',(req,res)=>{
    const {username , password} =req.body;

    db.select('hash','username')
        .where({username:username})
        .from('login')
        .then(data=>{  //data sto se vratilo od prethodnoto( email, hash )
            if(bcrypt.compareSync(password,data[0].hash)){
                return db.select('*')
                    .from('users')
                    .where('username','=',username)
                    .then(user=>{
                        res.json(user[0]);
                    })
                    .catch(err=>res.status(400).json('Unable to get user'))
            }
            res.status(400).json('Wrong Credentials');
        })
        .catch(err=>res.status(400).json('Wrong Credentials'));
});
//username, password
app.post('/register',(req,res)=>{
    const {username,password} = req.body;
    const hash= bcrypt.hashSync(password);

    db.transaction(trx => {
        trx.insert({
            hash:hash,
            username:username
        })
            .into('login')
            .returning('username')
            .then(loginUsername=>{
                return trx('users')
                    .returning('*')
                    .insert({
                        username:loginUsername[0]
                    })
                    .then(response=>{
                        res.json(response[0]);
                    })
            })
            .then(trx.commit)
            .catch(trx.rollback)
    }).catch(err=>res.status(400).json('Bad Request'));
});

app.listen(3001,()=>{
    console.log('app is running on port 3001');
});

