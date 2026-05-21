const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
}));
app.use(express.json());

// MongoDB Client
const client = new MongoClient(process.env.MONGODB_URL, {
    serverApi: { version: ServerApiVersion.v1, strict: true },
});

// Database Connection Helper
let cachedDb = null;
async function getDb() {
    if (cachedDb) return cachedDb;
    await client.connect();
    cachedDb = client.db("Medi-Queue");
    return cachedDb;
}

// Auth Middleware
const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({ error: true, message: "Unauthorized access" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: process.env.CLIENT_URL,
            audience: process.env.CLIENT_URL,
        });
        req.user = payload;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};

// ==================== API ROUTES ====================

// 1. Get all tutors
app.get("/tutors", async (req, res) => {
    const db = await getDb();
    const result = await db.collection("Tutors").find().toArray();
    res.json(result);
});

// 2. Create tutor
app.post("/tutors", async (req, res) => {
    const db = await getDb();
    const result = await db.collection("Tutors").insertOne(req.body);
    res.status(201).json({ success: true, result });
});

// 3. Single tutor & verifyToken
app.get("/tutors/:id", verifyToken, async (req, res) => {
    const db = await getDb();
    const result = await db.collection("Tutors").findOne({ _id: new ObjectId(req.params.id) });
    result ? res.json(result) : res.status(404).json({ error: "Tutor not found" });
});

// 4. Update & Delete Tutors
app.put("/tutors/:id", async (req, res) => {
    const db = await getDb();
    const result = await db.collection("Tutors").updateOne({ _id: new ObjectId(req.params.id) }, { $set: req.body });
    res.json({ success: result.modifiedCount > 0 });
});

app.delete("/tutors/:id", async (req, res) => {
    const db = await getDb();
    const result = await db.collection("Tutors").deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: result.deletedCount > 0 });
});

// 5. Booking Routes (Full functionality included)
app.post("/api/bookings", async (req, res) => {
    try {
        const db = await getDb();
        const { studentName, phone, tutorId, tutorName, studentEmail, bookedSlot } = req.body;
        const tutor = await db.collection("Tutors").findOne({ _id: new ObjectId(tutorId) });
        
        if (!tutor) return res.status(404).json({ message: "Tutor not found" });
        if ((tutor.totalSlots || 0) <= 0) return res.status(400).json({ message: "Fully booked" });

        const newBooking = { studentName, phone, tutorId: new ObjectId(tutorId), tutorName, studentEmail, bookedSlot: new Date(bookedSlot), createdAt: new Date() };
        await db.collection("Bookings").insertOne(newBooking);
        await db.collection("Tutors").updateOne({ _id: new ObjectId(tutorId) }, { $inc: { totalSlots: -1 } });
        res.status(201).json({ success: true, message: "Booked Successfully" });
    } catch (e) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/bookings/:id", async (req, res) => {
    const db = await getDb();
    const booking = await db.collection("Bookings").findOne({ _id: new ObjectId(req.params.id) });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    await db.collection("Bookings").deleteOne({ _id: new ObjectId(req.params.id) });
    await db.collection("Tutors").updateOne({ _id: new ObjectId(booking.tutorId) }, { $inc: { totalSlots: 1 } });
    res.json({ success: true });
});

app.get("/api/bookings", async (req, res) => {
    const db = await getDb();
    const query = req.query.email ? { studentEmail: req.query.email } : {};
    res.json(await db.collection("Bookings").find(query).toArray());
});

app.get("/", (req, res) => res.send("MediQueue Server is running fine"));

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => console.log(`Server running on port ${port}`));
}

module.exports = app;