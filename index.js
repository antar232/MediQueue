const express = require('express')
const dotenv = require('dotenv') 
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

dotenv.config();
const app = express()

// Middleware
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_PORT;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    
    await client.connect();

    const db = client.db('Medi-Queue')
    const tutorCollection = db.collection('Tutors')
    
    
    app.get('/tutor', async(req, res)=>{
      const result = await tutorCollection.find().toArray();
      res.json(result);
    });

    app.post('/tutor', async(req, res) => {
      const newTutor = req.body;
      const result = await tutorCollection.insertOne(newTutor);
      res.status(201).json(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

  } catch (error) {
    console.error("Database connection error:", error);
  } finally {
    
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('MediQueue Server is running fine')
})


app.listen(port, () => {
  console.log(`MediQueue app listening on port ${port}`)
})