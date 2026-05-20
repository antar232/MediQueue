// const express = require("express");
// const dotenv = require("dotenv");
// const cors = require("cors");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();
// const app = express();

// // Middleware
// app.use(cors());
// app.use(express.json());

// const port = process.env.PORT || 5000;
// const uri = process.env.MONGODB_URL;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();

//     const db = client.db("Medi-Queue");
//     const tutorCollection = db.collection("Tutors");

//     app.get("/tutors", async (req, res) => {
//       const result = await tutorCollection.find().toArray();
//       res.json(result);
//     });

//     app.post("/tutors", async (req, res) => {
//       const newTutor = req.body;
//       const result = await tutorCollection.insertOne(newTutor);
//       res.status(201).json(result);
//     });

//     // app.get('/tutor/:id',async(req, res)=>{
//     //   const {id} = req.params
//     //   const result = await tutorCollection.findOne({_id: new ObjectId(id)})
//     //   res.json(result);
//     // })
//     app.get("/tutors/:id", async (req, res) => {
//       try {
//         const { id } = req.params;

//         // ১. চেক করুন আইডি-টি ২৪ ক্যারেক্টারের ভ্যালিড মঙ্গোডিবি আইডি কি না
//         if (!ObjectId.isValid(id)) {
//           return res.status(400).json({ error: "Invalid ID format" });
//         }

//         const result = await tutorCollection.findOne({ _id: new ObjectId(id) });

//         // ২. যদি ডাটাবেজে ওই আইডির কোনো টিউটর না পাওয়া যায়
//         if (!result) {
//           return res.status(404).json({ error: "Tutor not found" });
//         }

//         res.json(result);
//       } catch (error) {
//         console.error("Error fetching single tutor:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//       }
//     });

//     await client.db("admin").command({ ping: 1 });
//     console.log(
//       "Pinged your deployment. You successfully connected to MongoDB!",
//     );
//   } catch (error) {
//     console.error("Database connection error:", error);
//   } finally {
//     // await client.close();
//   }
// }
// run().catch(console.dir);

// app.get("/", (req, res) => {
//   res.send("MediQueue Server is running fine");
// });

// app.listen(port, () => {
//   console.log(`MediQueue app listening on port ${port}`);
// });
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URL;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("Medi-Queue");
    const tutorCollection = db.collection("Tutors");
    
   
    const bookingCollection = db.collection("Bookings");

    // ==================== TUTOR RAUTES ====================
    app.get("/tutors", async (req, res) => {
      const result = await tutorCollection.find().toArray();
      res.json(result);
    });

    app.post("/tutors", async (req, res) => {
      const newTutor = req.body;
      const result = await tutorCollection.insertOne(newTutor);
      res.status(201).json(result);
    });

    app.get("/tutors/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const result = await tutorCollection.findOne({ _id: new ObjectId(id) });

        if (!result) {
          return res.status(404).json({ error: "Tutor not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Error fetching single tutor:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });


    // ==================== 🎉 NEW: BOOKING ROUTE ====================
    app.post("/api/bookings", async (req, res) => {
      try {
        const { 
          studentName, 
          phone, 
          tutorId, 
          tutorName, 
          studentEmail, 
          bookingStatus, 
          bookedSlot 
        } = req.body;

        
        if (!ObjectId.isValid(tutorId)) {
          return res.status(400).json({ message: "Invalid Tutor ID format" });
        }

        
        const tutor = await tutorCollection.findOne({ _id: new ObjectId(tutorId) });
        if (!tutor) {
          return res.status(404).json({ message: "Tutor not found!" });
        }


        const currentSlots = tutor.totalSlots !== undefined ? tutor.totalSlots : tutor.totalSlot || 0;
        if (currentSlots <= 0) {
          return res.status(400).json({ 
            message: "This session is fully booked. You can’t join at the moment." 
          });
        }

        
        const newBooking = {
          studentName,
          phone,
          tutorId: new ObjectId(tutorId),
          tutorName,
          studentEmail,
          bookingStatus: bookingStatus || "Booked", // Auto-generated
          bookedSlot: bookedSlot ? new Date(bookedSlot) : new Date(), // Datepicker
          sessionToken: `SESSION-${Math.random().toString(36).substr(2, 9).toUpperCase()}`, // Auto-generated token
          createdAt: new Date()
        };

        const bookingResult = await bookingCollection.insertOne(newBooking);

        await tutorCollection.updateOne(
          { _id: new ObjectId(tutorId) },
          { $inc: { totalSlots: -1 } } 
        );

        res.status(201).json({
          success: true,
          message: "Session Booked Successfully! 🎉",
          bookingId: bookingResult.insertedId,
          sessionToken: newBooking.sessionToken
        });

      } catch (error) {
        console.error("Booking submission error:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    
    app.get("/api/bookings", async (req, res) => {
      const { email } = req.query;
      let query = {};
      if (email) {
        query = { studentEmail: email };
      }
      const result = await bookingCollection.find(query).toArray();
      res.json(result);
    });


    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (error) {
    console.error("Database connection error:", error);
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("MediQueue Server is running fine");
});

app.listen(port, () => {
  console.log(`MediQueue app listening on port ${port}`);
});