// const express = require("express");
// const nodemailer = require("nodemailer");
// const cors = require("cors");

// const app = express();
// app.use(cors());
// app.use(express.json());

// app.post("/send-login-email", async (req, res) => {
//   const { name, email } = req.body;

//   const transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//       user: "karanksxxx@gmail.com",
//       pass: "vqla xjtv arnf ulpf", // App-specific password (not your real Gmail password)
//     },
//   });

//   const mailOptions = {
//     from: '"KARANKS1436 👾" <karanksxxx@gmail.com>',
//     to: email,
//     subject: "Login Successful - KARANKS1436",
//     html: `
//       <h2>Hello ${name},</h2>
//       <p>You have logged in successfully at ${new Date().toLocaleString()}.</p>
//       <p>Welcome back to <strong>KARANKS1436</strong>!</p>
//     `,
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     res.status(200).json({ message: "Email sent successfully!" });
//   } catch (error) {
//     console.error("Email send error:", error);
//     res.status(500).json({ error: "Failed to send email." });
//   }
// });

// const PORT = 5000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express(); 
app.use(cors());
app.use(express.json());

app.post("/send-login-email", async (req, res) => {
  const { name, email } = req.body;

  // Load your HTML template
  const templatePath = path.join(__dirname, "templates", "loginTemplate.html");
  let htmlTemplate = fs.readFileSync(templatePath, "utf-8");

  // Replace placeholders
  htmlTemplate = htmlTemplate
    .replace(/{{user_name}}/g, name)
    .replace(/{{login_time}}/g, new Date().toLocaleString());

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "karanksxxx@gmail.com",
      pass: "vqla xjtv arnf ulpf",
    },
  });

  const mailOptions = {
    from: '"KARANKS1436 👾" <karanksxxx@gmail.com>',
    to: email,
    subject: `Welcome back, ${name}!`,
    html: htmlTemplate,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Email sent successfully!" });
  } catch (error) {
    console.error("Nodemailer error:", error);
    res.status(500).json({ error: "Failed to send email." });
  }
});


app.post("/send-bulk-email", async (req, res) => {
  const { emails, message, fileUrl } = req.body;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "karanksxxx@gmail.com",
      pass: "vqla xjtv arnf ulpf",
    },
  });

  try {
    await Promise.all(
      emails.map((to_email) => {
        const html = `
        <div style="max-width: 640px; margin: auto; font-family: 'Segoe UI', Roboto, sans-serif; background: linear-gradient(145deg, #1f1f22, #141416); color: #eaeaea; border-radius: 16px; padding: 28px; box-shadow: 0 0 20px rgba(0, 229, 255, 0.2); border: 1px solid #2b2b2e;">
          <header style="text-align: center; border-bottom: 1px solid #333; padding-bottom: 20px; margin-bottom: 30px;">
            <h2 style="color: #00e5ff; margin: 0; font-size: 26px;">🚀 Karanks1436 Notification</h2>
            <p style="color: #aaa; font-size: 15px; margin-top: 8px;">You are receiving this as a valued member of <strong>Karanks1436</strong>.</p>
          </header>

          <section style="margin-bottom: 32px;">
            <h3 style="color: #00ffc3; font-size: 18px; margin-bottom: 10px;">📝 Message:</h3>
            <div style="background: #262628; padding: 18px 20px; border-left: 4px solid #00e5ff; border-radius: 10px; font-size: 16px; color: #f1f1f1; line-height: 1.6;">
              ${message || "No message provided."}
            </div>
          </section>

          ${fileUrl ? `
            <section style="margin-bottom: 32px;">
              <h3 style="color: #00ffc3; font-size: 18px; margin-bottom: 10px;">📎 Attached File / Image:</h3>
              <a href="${fileUrl}" target="_blank" style="display: inline-block; color: #4fc3f7; font-size: 15px; word-break: break-all; margin-bottom: 12px;">🔗 ${fileUrl}</a>
              <div style="margin-top: 16px; text-align: center;">
                <img src="${fileUrl}" alt="Attachment" style="max-width: 100%; border-radius: 12px; box-shadow: 0 0 12px rgba(0,0,0,0.4);" />
              </div>
            </section>
          ` : ""}

          <footer style="border-top: 1px solid #333; padding-top: 20px; text-align: center; font-size: 13px; color: #888;">
            <p>This notification was sent via the <strong>Karanks1436 Admin Panel</strong>.</p>
            <p>© 2025 Karanks1436 • All rights reserved.</p>
          </footer>
        </div>
        `;

        return transporter.sendMail({
          from: '"Karanks1436 👾" <karanksxxx@gmail.com>',
          to: to_email,
          subject: "🔔 Notification from Admin",
          html,
        });
      })
    );

    res.status(200).send({ success: true, message: "Emails sent!" });
  } catch (err) {
    console.error("Send error:", err);
    res.status(500).send({ success: false, message: "Failed to send emails" });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
