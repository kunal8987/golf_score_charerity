// Creates an admin account. Run once per environment:
//   npm run create-admin -w services/auth -- admin@example.com "Admin Name" "Passw0rd123"
const { connectDb } = require("@dh/shared");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const { password: passwordSchema } = require("../src/validators/auth.validator");

(async () => {
  const [email, name, password] = process.argv.slice(2);
  if (!email || !name || !password) {
    console.error('Usage: npm run create-admin -w services/auth -- <email> "<name>" "<password>"');
    process.exit(1);
  }
  const check = passwordSchema.safeParse(password);
  if (!check.success) {
    console.error(check.error.issues[0].message);
    process.exit(1);
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set in .env");

  await connectDb(process.env.MONGO_URI, "create-admin");
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash: await User.hashPassword(password),
    role: "admin",
  });
  console.log(`Admin created: ${user.email}`);
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err.code === 11000 ? "A user with that email already exists" : err.message);
  await mongoose.disconnect();
  process.exit(1);
});
