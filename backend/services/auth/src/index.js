const cookieParser = require("cookie-parser");
const { createService, startService, assertAuthConfig } = require("@dh/shared");

const SERVICE = "auth-service";

assertAuthConfig(); // stops startup with a clear message if JWT_SECRET is missing

const app = createService(SERVICE);
app.set("trust proxy", 1); // requests arrive through the gateway; use X-Forwarded-For for the real client IP
app.use(cookieParser());
app.use(require("./routes"));

startService(SERVICE, app, process.env.PORT || 4001, { mongoUri: process.env.MONGO_URI }).catch((err) => {
  console.error(err);
  process.exit(1);
});
