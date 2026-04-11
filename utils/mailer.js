// utils/mailer.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendVerificationEmail = async (email, token) => {
    const verifyUrl = `${process.env.CLIENT_URL}/verify?token=${token}`;

    await transporter.sendMail({
        from: '"Poker Ledger" <no-reply@pokerledger.com>',
        to: email,
        subject: "Verify your seat at the Poker Ledger",
        html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f7f7f7; padding: 40px 0;">
            <div style="max-width: 480px; margin: auto; background: #ffffff; padding: 30px; border-radius: 10px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                
                <h2 style="margin-bottom: 10px; color: #111;">Welcome to the Circle.</h2>
                
                <p style="font-size: 15px; color: #444; margin-bottom: 25px; line-height: 1.5;">
                    You're just one step away from accessing your Poker Ledger.  
                    Verify your email to take your seat at the table.
                </p>

                <a href="${verifyUrl}" 
                   style="display: inline-block; background: #c4a437; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
                    Verify My Email
                </a>

                <p style="font-size: 12px; color: #888; margin-top: 25px;">
                    If you didn’t request this, you can safely ignore this email.
                </p>

            </div>
        </div>
    `
    });
};

module.exports = { sendVerificationEmail };