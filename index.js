const dotenv = require('dotenv').config(); // to get .env values
const express = require('express');
//const path = require('path');
const ejs = require("ejs"); // require embeded javascript
const bodyParser = require('body-parser'); // to help get form data from frontend
const cors = require('cors')
const multer = require('multer'); // to catch files from form data from frontend
const { ObjectId } = require('mongodb');
const mongoose = require("mongoose"); // to build connection between server and mongoDB
const session = require("express-session"); // to store user session details
const mongoStore = require("connect-mongo"); // it helps in storing session datas
const bcrypt = require("bcrypt"); // it will help to encrypt user password
var randomstring = require("randomstring"); // to create random string 
const { initializeApp } = require('firebase/app'); // require firebase
const { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } = require("firebase/storage"); // getting required services from firestore
const firebaseConfig = {
    apiKey: process.env.apiKey,
    authDomain: process.env.authDomain,
    projectId: process.env.projectId,
    storageBucket: process.env.storageBucket,
    messagingSenderId: process.env.messagingSenderId,
    appId: process.env.appId,
    measurementId: process.env.measurementId
};
const fireBaseApp = initializeApp(firebaseConfig);
const storage = getStorage(); //points to root directory of 
const imagesRef = ref(storage, 'images/'); // create images reference or images (child)folder inside root directory
const documentsRef = ref(storage, 'documents/') //create documents reference or documents (child)folder inside root directory
// build connection with mongo
const mongodb_url = process.env.MONGO_URL; // getting mongo url
const mongodbOptions = { useNewUrlParser: true }; // mongo options need during making connection
const connectToMongoDB = async function () {
    try {
        await mongoose.connect(mongodb_url, mongodbOptions);
        console.log("connected Success fully");
    } catch (error) {
        console.log(error);
    }
}
connectToMongoDB(); // connect to mongoDB

const app = express();  // make express app first
app.use(cors({origin:"http://localhost:5000"}))
app.use(bodyParser.urlencoded({ extended: true })); // enables to get data from client side
app.use(express.static("public")); // to serve as a basic file to front side browser
app.set("view engine", "ejs"); // to render ejs files

//create multer instances -- that will be used as a middleware 
const upload = multer({
    // set file limit
    limits: {
        fileSize: 1024 * 1024 * 10 // 10 MB max size
    },
    fileFilter: function (req, file, callBackFn) {
        const fileType = file.mimetype;
        if (fileType === "application/pdf" || "image/jpeg" || "image/png") {
            callBackFn(null, true);
        } else {
            callBackFn(new Error("You have not entered valid file"));
        }
    },
    storage: multer.memoryStorage()// store files in the memory as buffer
})

// using session middle are for every routes - to get user Id and to authenticate them
app.use(session({
    secret: process.env.SECRET_SESSION,
    resave: false,
    saveUninitialized: false,
    store: mongoStore.create({
        mongoUrl: mongodb_url,
        collectionName: "Session"
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 Week expairy date // 1000=1sec, 1000*60 = 1min , 1000*60*60 = 1hr ,1000*60*60*24*7 = 1 week  
        // cookies will be stored for one week and then automatically deleted.
    }
}));


// first define a schema
const usersSchema = new mongoose.Schema({
    name: String,
    email: String,
    userType: String,
    password: String,
    isApproved : Number
});
const User = new mongoose.model("User", usersSchema);

const documentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users"
    },
    uploadedBy: {
        type: String,
        ref: "users"
    },
    relatedSem: Number,
    docOriginalName: String,
    docGivenName: String,
    uploadDate: {
        type: Date,
        default: Date.now
    },
    uploadedDocUrl: {
        required: true,
        type: String
    },
    docType: {
        required: true,
        type: String
    },
    usesType: {
        type: String,
        default: "study_material"
    }
})
// creates a new collection in the database named with documents
const Document = new mongoose.model("Document", documentSchema);
// GET --- HOME ROUTE 
app.get("/", async (req, res) => {
    if (req.session.isAuth === true) {
        // user_id is stored in session as req.session.user_ID 
        //check user type -- teacher or student 
        const foundUser = await User.findOne({ _id: req.session.user_ID });
        if (foundUser) {
            if (foundUser.userType === "Student") {
                res.redirect(`/student/${req.session.user_ID}`);
            } else {
                res.redirect(`/teacher/${req.session.user_ID}`);
            }
        } else {
            res.render("home");
        }
    }
    else {
        res.render("home");
    }
})
app.get("/register", (req, res) => {
    // res.sendFile('public/registration.html' , {root : __dirname});
    res.render("registration");
});
app.post("/register", async (req, res) => {
    try {
        const name = req.body.name;
        const email = req.body.email;
        const userType = req.body.userType;
        const password = req.body.password;
        const foundUser = await User.findOne({ email: email });
        if (foundUser) {
            res.send("User exists");
        } else {
            let num = 0; 
            if (userType === "Student") {
                num = 1;
            }
            const newUser = new User({
                name: name,
                email: email,
                userType: userType,
                password: password,
                isApproved : num
            });
            const savedUser = await newUser.save();
            // these session datas are being saved in my mongoDB data base -- browser only storing session id in the Cokie - which will be sent to server in every request it makes
            // when user is saved set session credentials
            req.session.user_ID = savedUser._id; // adding user id to session
            req.session.isAuth = true; // setting authenticate property -true.. that will be cheked in the routes
            req.session.userType = savedUser.userType; // setting user type as teacher or student - will be required to check in upload routing
            // redirect according to user type page
            if (savedUser.userType === "Student") {
                res.redirect(`/student/${savedUser._id}`)
            } else if (savedUser.userType === "Teacher") {
                res.redirect(`/teacher/${savedUser._id}`)
            }
        }
    } catch (error) {
        console.log(error);
    }
})
app.get("/login", async (req, res) => {
    // checks whether user is already logedIn or not
    if (req.session.isAuth === true) {
        const foundUser = await User.findOne({ _id: req.session.user_ID }).select('-password');
        if (foundUser.userType === "Teacher") {
            res.redirect(`/teacher/${foundUser._id}`)
        } else if (foundUser.userType === "Student") {
            res.redirect(`/student/${foundUser._id}`)
        } else {
            res.render("login");
        }
    } else {
        res.render("login");
    }
})
app.post("/login", async (req, res) => {
    // const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const findUser = await User.findOne({ email: email });
    if (findUser) {
        //check pasword
        if (findUser.password === password) {
            //check wheather techer or student
            if (findUser.userType === "Teacher") {
                // sending teacher page
                // when user is saved set session credentials
                req.session.user_ID = findUser._id; // adding user id to session
                req.session.isAuth = true; // setting authenticate property -true.. that will be cheked in the routes
                req.session.userType = findUser.userType; // setting user type as teacher or student - will be required to check in upload routing
                res.redirect(`/teacher/${findUser._id}`)
            } else {
                // when user is saved set session credentials
                req.session.user_ID = findUser._id; // adding user id to session
                req.session.isAuth = true; // setting authenticate property -true.. that will be cheked in the routes
                req.session.userType = findUser.userType; // setting user type as teacher or student - will be required to check in upload routing
                // sending student page 
                res.redirect(`/student/${findUser._id}`)
            }
        } else {
            res.redirect("/login");
        }
    } else {
        res.redirect("/register");
    }
});
app.get('/logout', (req, res) => {
    // first check whether authorised or not
    if (req.session.isAuth === true) {
        req.session.destroy((err) => {
            if (err) {
                console.log(err);
            } else {
                console.log("User loged out successfully");
                // redirect to home route
                res.redirect('/');
            }
        })
    } else {
        // send log in page
        res.redirect('/login');
    }
})
//---------------- GET NO OF DOCUMENTS IN EACH SEMESTERS --------------
let sem1TotalDocs;
let sem2TotalDocs;
let sem3TotalDocs;
let sem4TotalDocs;
async function findTotalDocs() {
    sem1TotalDocs = await Document.countDocuments({ relatedSem: 1 });
    sem2TotalDocs = await Document.countDocuments({ relatedSem: 2 });
    sem3TotalDocs = await Document.countDocuments({ relatedSem: 3 });
    sem4TotalDocs = await Document.countDocuments({ relatedSem: 4 });
}

// get particular teacher & send teacher page
app.get("/teacher/:id", async (req, res) => {
    // first check whether user is authenticated or not
    if (req.session.isAuth === true && req.session.userType === "Teacher") {
        const foundUser = await User.findOne({ _id: req.params.id });

        // find total no of documents in each semester & pass to teacher or student page ;
        // .exec(function (err, person) {
        //     if (err) return handleError(err);
        //     // Prints "Space Ghost is a talk show host."
        //     console.log('%s %s is a %s.', person.name.first, person.name.last,
        //         person.occupation);
        // });;
        await findTotalDocs(); // call & set total docs
        res.render("teacher", { user: foundUser, sem1TotalDocs, sem2TotalDocs, sem3TotalDocs, sem4TotalDocs });
    } else {
        // user is not authenticated and send login page
        res.redirect("/login");
    }
})
// get particular student & send student page
app.get("/student/:id", async (req, res) => {
    if (req.session.isAuth === true && req.session.userType === "Student") {
        const foundUser = await User.findOne({ _id: req.params.id });
        await findTotalDocs(); // call & set total docs
        res.render("student", { user: foundUser, sem1TotalDocs, sem2TotalDocs, sem3TotalDocs, sem4TotalDocs });
    } else {
        res.redirect('/login');
    }
})


app.get("/uploads/sem/:semNum", (req, res) => {
    // here first check two things 1) whether user is authenti cated & 2) user is teacher or student --
    // bcoz if it is student it will be not allowed to upload any data
    const num = req.params.semNum;
    if (req.session.isAuth === true && req.session.userType === "Teacher") {
        // it is teacher & authenticated to upload docs
        res.render("semupload", { semesterNum: num });
    } else {
        // it is not authenticated - send login page
        res.redirect("/login");
    }
});
// to create random string
// randomstring.generate({length:12,charset : 'alphanumeric'})
// console.log(randomstring.generate({
//     length: 12,
//     charset: 'alphanumeric'
//   }));
app.post("/uploads/sem/:semNum", upload.single('sem_file'), async (req, res) => {
    if (req.session.isAuth === true && req.session.userType === "Teacher") { //authorised
        // console.log(req.file);
        // console.log(req.file.buffer);
        // console.log(req.session.user_ID);
        const foundUser = await User.findOne({ _id: req.session.user_ID }).select("-password"); // gives all things without password
        // console.log(foundUser);
        const relatedSem = req.params.semNum;
        const userId = req.session.user_ID;
        const uploadedBy = foundUser.name;
        const docOriginalName = req.file.originalname;
        let uploadedDocUrl = "";
        const docType = req.file.mimetype;
        const usesType = "study_material";
        // Generate Random string -- to prevent overide of files
        const now = new Date();
        const dateStamp = now.toISOString();
        const randomString = randomstring.generate({ length: 12, charset: "alphanumeric" })
        const docGivenName = docOriginalName + dateStamp + randomString;
        const metaData = {
            contentType: req.file.mimetype
        }
        let uploadTask;
        //-----------FILE UPLOADING STARTS ------------------
        if (req.file.mimetype === "image/jpeg" || req.file.mimetype === "image/png") {
            const imagesFolderRef = ref(imagesRef, `semester${relatedSem}/${docGivenName}`);
            uploadTask = uploadBytes(imagesFolderRef, req.file.buffer, metaData);
        } else if (req.file.mimetype === "application/pdf") {
            const documentsFolderRef = ref(documentsRef, `semester${relatedSem}/${docGivenName}`);
            uploadTask = uploadBytes(documentsFolderRef, req.file.buffer, metaData);
        }
        //-----------FILE UPLOADING ENDS ------------------
        //-----------GET DOCUMENT URL----------------
        uploadTask.then((snapshot) => {
            getDownloadURL(snapshot.ref).then(async (downloadURL) => {
                // console.log('File available at', downloadURL);
                uploadedDocUrl = downloadURL;
                //----------UPLOAD ALL CREDENTIALS OF FILE TO MONGODB ---------
                const dataOfUploadedMongo = new Document({
                    userId: userId,
                    uploadedBy: uploadedBy,
                    relatedSem: relatedSem,
                    docOriginalName: docOriginalName,
                    docGivenName: docGivenName,
                    uploadedDocUrl: uploadedDocUrl,
                    docType: docType,
                    usesType: usesType,
                });
                await dataOfUploadedMongo.save();
                res.render("success");
            });
        });
    }
    // means unauthorised
    else {
        res.redirect("/login");
    }
})
// document view page route
app.get("/view/docs/sem/:semNum", async (req, res) => {
    //first uthenticate
    const semNum = req.params.semNum;

    if (req.session.isAuth === true) {
        const finduser = await User.findOne({ _id: req.session.user_ID }).select("-password");
        const allRelatedSemesterDocs = await Document.find({ relatedSem: semNum }); // all docs for corresponding semester
        const selfUploadedDocs = await allRelatedSemesterDocs.filter((individualDoc) => {
            return individualDoc.userId.toString() === finduser._id.toString();
        })
        //other teacher docs
        const otherTeacherDocs = await allRelatedSemesterDocs.filter((individualDoc) => {
            return individualDoc.userId.toString() != finduser._id.toString();
        })
        res.render("alldocsviewpage", { semNum, user: finduser, documents: allRelatedSemesterDocs, selfUploadedDocs, otherTeacherDocs });
    } else {
        res.redirect("/login")
    }
});
//here post route is used instead of delete route -- because browser is not supporting method="delete" rather it is converting delete method to get method automatically
app.post("/delete/doc/sem/:semNum/:docId", async (req, res) => {
    const semNum = req.params.semNum;
    const docId = req.params.docId;

    const findThatDoc = await Document.findById(docId);
    const docGivenName = findThatDoc.docGivenName;
    // console.log(findThatDoc);
    // console.log(docGivenName);
    const imagesFolderRef = ref(imagesRef, `semester${semNum}/${docGivenName}`);
    const documentsFolderRef = ref(documentsRef, `semester${semNum}/${docGivenName}`);
   
    if (findThatDoc.docType === "image/png" || findThatDoc.docType === "image/jpeg" ) {
        // delete image
        deleteObject(imagesFolderRef).then(async() => {
            // File deleted successfully -- then delete in mongoDB
            await Document.findByIdAndDelete(docId);
            res.redirect(`/view/docs/sem/${semNum}`);
        }).catch((error) => {
            console.log(error);
        });
    }else{
        //delete document
        deleteObject(documentsFolderRef).then( async() => {
            // File deleted successfully -- then delete in mongoDB
            await Document.findByIdAndDelete(docId);
            res.redirect(`/view/docs/sem/${semNum}`);
        }).catch((error) => {
            console.log(error);
        });
    }
})




const port = process.env.PORT || 5000;
app.listen(port, function () {
    console.log("Server started on port " + `${port}`);
})