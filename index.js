const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const { error } = require("cros/common/logger");

dotenv.config();
const app = express();

// Middleware
//app.use(cors());
app.use(cors({
  origin: `${process.env.CLIENT_URL}`,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}));
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
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("Received Auth Header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({
      error: true,
      message: "Unauthorized access: Token missing or invalid format",
    });
  }

  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${process.env.CLIENT_URL}`,
      audience: `${process.env.CLIENT_URL}`,
    });
    req.user = payload;
    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

async function run() {
  try {
    //await client.connect();

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
      try {
        const result = await tutorCollection.insertOne(newTutor);
        res.status(201).json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
      }
    });

    app.get("/tutors/:id", verifyToken, async (req, res) => {
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

    app.put("/tutors/:id", async (req, res) => {
      const { id } = req.params;
      const updateData = req.body;
      try {
        const result = await tutorCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
        );
        res.json({ success: result.modifiedCount > 0 });
      } catch (error) {
        res.status(500).json({ success: false, message: "Update failed" });
      }
    });

    app.delete("/tutors/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await tutorCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json({ success: result.deletedCount > 0 });
      } catch (error) {
        res.status(500).json({ success: false, message: "Delete failed" });
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
          bookedSlot,
        } = req.body;

        if (!ObjectId.isValid(tutorId)) {
          return res.status(400).json({ message: "Invalid Tutor ID format" });
        }

        const tutor = await tutorCollection.findOne({
          _id: new ObjectId(tutorId),
        });
        if (!tutor) {
          return res.status(404).json({ message: "Tutor not found!" });
        }

        const currentSlots =
          tutor.totalSlots !== undefined
            ? tutor.totalSlots
            : tutor.totalSlot || 0;
        if (currentSlots <= 0) {
          return res.status(400).json({
            message:
              "This session is fully booked. You can’t join at the moment.",
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
          createdAt: new Date(),
        };

        const bookingResult = await bookingCollection.insertOne(newBooking);

        await tutorCollection.updateOne(
          { _id: new ObjectId(tutorId) },
          { $inc: { totalSlots: -1 } },
        );

        res.status(201).json({
          success: true,
          message: "Session Booked Successfully! 🎉",
          bookingId: bookingResult.insertedId,
          sessionToken: newBooking.sessionToken,
        });
      } catch (error) {
        console.error("Booking submission error:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });
    app.delete("/api/bookings/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const booking = await bookingCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }

        const result = await bookingCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount > 0) {
          await tutorCollection.updateOne(
            { _id: new ObjectId(booking.tutorId) },
            { $inc: { totalSlots: 1 } },
          );
          res.json({
            success: true,
            message: "Booking cancelled successfully",
          });
        } else {
          res.status(400).json({ success: false, message: "Failed to delete" });
        }
      } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({ success: false, message: "Server error" });
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

    //await client.db("admin").command({ ping: 1 });
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
