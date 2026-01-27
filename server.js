require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());

// ------------------ SUPABASE SETUP ------------------
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "✓ Set" : "✗ Missing");
console.log("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "✓ Set" : "✗ Missing");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ------------------ SIGNUP ------------------
app.post("/signup", async (req, res) => {
  console.log("\n=== SIGNUP REQUEST ===");
  console.log("Body received:", req.body);
  
  try {
    const { name, email, password } = req.body;
    
    console.log("Name:", name);
    console.log("Email:", email);
    console.log("Password length:", password ? password.length : "undefined");
    
    if (!name || !email || !password) {
      console.log("❌ Missing fields");
      return res.status(400).json({ message: "Missing fields" });
    }

    console.log("Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Password hashed ✓");

    console.log("Creating user in Supabase Auth...");
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      console.log("❌ Auth error:", authError);
      return res.status(400).json({ message: authError.message });
    }

    console.log("User created in Auth ✓ User ID:", authData.user.id);

    console.log("Inserting into profiles table...");
    const { error: profileError } = await supabase
    .schema('api')
    .from("profiles")
    .insert({
      id: authData.user.id,
      name,
      email,
      password: hashedPassword
  });

    if (profileError) {
      console.error("❌ Profile creation error:", profileError);
      return res.status(500).json({ message: "Failed to create profile: " + profileError.message });
    }

    console.log("Profile created ✓");
    console.log("✅ Signup successful!");

    res.json({ 
      message: "Signup successful", 
      userId: authData.user.id, 
      email,
      name 
    });
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ------------------ LOGIN ------------------
app.post("/login", async (req, res) => {
  console.log("\n=== LOGIN REQUEST ===");
  console.log("Body received:", req.body);
  
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      console.log("❌ Missing fields");
      return res.status(400).json({ message: "Missing fields" });
    }

    console.log("Fetching user profile for:", email);
    const { data: profileData, error: profileError } = await supabase
      .schema('api')
      .from("profiles")
      .select("id, name, email, password")
      console.log("User found ✓");
      console.log("DEBUG - Profile data returned:", JSON.stringify(profileData));
      console.log("DEBUG - Password field:", profileData?.password);
      console.log("DEBUG - Password exists?:", !!profileData?.password);
    if (profileError || !profileData) {
      console.log("❌ User not found:", profileError);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    console.log("User found ✓");
    console.log("Verifying password...");
    
    const passwordMatch = await bcrypt.compare(password, profileData.password);

    if (!passwordMatch) {
      console.log("❌ Password mismatch");
      return res.status(401).json({ message: "Invalid email or password" });
    }

    console.log("✅ Login successful!");
    res.json({ 
      success: true, 
      userId: profileData.id, 
      email: profileData.email,
      name: profileData.name 
    });

  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ------------------ CREATE WAGER ------------------
app.post("/wagers", async (req, res) => {
  console.log("\n=== CREATE WAGER REQUEST ===");
  console.log("Body received:", req.body);
  
  try {
    const { userId, groupName, description, amount, startDate, endDate, payout, members } = req.body;
    
    if (!userId || !groupName || !description || !amount || !startDate || !endDate || !payout || !members || members.length === 0) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    console.log("Inserting wager...");
    const { data: wagerData, error: wagerError } = await supabase
      .schema('api')
      .from("wagers")
      .insert([{
        user_id: userId,
        group_name: groupName,
        description,
        amount: amount,
        start_date: startDate,
        end_date: endDate,
        payout
      }])
      .select()
      .single();

    if (wagerError) {
      console.error("❌ Wager insert error:", wagerError);
      return res.status(500).json({ success: false, message: wagerError.message });
    }

    console.log("Wager created ✓");
    console.log("Inserting members...");
    
    const memberRows = members.map(email => ({ 
      wager_id: wagerData.id, 
      email 
    }));
    
    const { error: memberError } = await supabase
      .schema('api')
      .from("wager_members")
      .insert(memberRows);

    if (memberError) {
      console.error("❌ Member insert error:", memberError);
      return res.status(500).json({ success: false, message: memberError.message });
    }

    console.log("✅ Wager created successfully!");
    res.json({ success: true, wagerId: wagerData.id });

  } catch (err) {
    console.error("❌ Server error creating wager:", err);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

// ------------------ GET WAGERS ------------------
app.get("/wagers/:userId", async (req, res) => {
  console.log("\n=== GET WAGERS REQUEST ===");
  console.log("User ID:", req.params.userId);
  
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .schema('api')
      .from("wagers")
      .select(`
        id,
        group_name,
        description,
        amount,
        start_date,
        end_date,
        payout,
        wager_members(email)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.status(500).json({ success: false, error });
    }

    console.log("✅ Found", data.length, "wagers");
    res.json(data || []);

  } catch (err) {
    console.error("❌ Server error loading wagers:", err);
    res.status(500).json([]);
  }
});

// ------------------ ROOT ------------------
app.get("/", (req, res) => {
  console.log("Root endpoint hit");
  res.send("Backend connected to Supabase - Debug Mode");
});

// ------------------ START SERVER ------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("\n🚀 Server running on port", PORT);
  console.log("Debug mode enabled - all requests will be logged\n");
});




