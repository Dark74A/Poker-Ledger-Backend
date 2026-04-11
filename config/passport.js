
const passport      = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User           = require("../models/user.model");

passport.use(
    new GoogleStrategy(
        {
            clientID:     process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL:  `${process.env.SERVER_URL || "http://localhost:5000"}/api/auth/google/callback`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
            try {
                const email  = profile.emails?.[0]?.value;
                const name   = profile.displayName;
                const avatar = profile.photos?.[0]?.value;

                let user = await User.findOne({ googleId: profile.id });
                if (user) return done(null, user);

                if (email) {
                    user = await User.findOne({ email });
                    if (user) {
                        user.googleId = profile.id;
                        user.avatar   = user.avatar || avatar;
                        await user.save();
                        return done(null, user);
                    }
                }

                user = await User.create({
                    googleId: profile.id,
                    email,
                    name,
                    avatar,
                });

                return done(null, user);
            } catch (err) {
                return done(err, null);
            }
        }
    )
);

module.exports = passport;