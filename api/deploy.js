const multiparty = require("multiparty");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { execSync } = require("child_process");
const { v4: uuidv4 } = require("uuid");

const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;

// Helper: HTTPS request dengan promise
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// Helper: Upload binary (zip) via https
function uploadZip(siteId, zipBuffer) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.netlify.com",
      path: `/api/v1/sites/${siteId}/deploys`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${NETLIFY_TOKEN}`,
        "Content-Type": "application/zip",
        "Content-Length": zipBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    req.write(zipBuffer);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!NETLIFY_TOKEN) {
    return res.status(500).json({ error: "NETLIFY_TOKEN belum di-set di environment variables" });
  }

  const form = new multiparty.Form({ maxFilesSize: 20 * 1024 * 1024 });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: "Gagal parse form: " + err.message });

    try {
      const uploadedFile = files.site_file?.[0];
      if (!uploadedFile) return res.status(400).json({ error: "File wajib ada" });

      const siteName = (fields.site_name?.[0] || "")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30);

      const uid = uuidv4().split("-")[0];
      const finalName = siteName ? `${siteName}-${uid}` : `noxvus-${uid}`;

      // 1. Buat site Netlify
      const createSite = await httpsRequest(
        {
          hostname: "api.netlify.com",
          path: "/api/v1/sites",
          method: "POST",
          headers: {
            Authorization: `Bearer ${NETLIFY_TOKEN}`,
            "Content-Type": "application/json",
          },
        },
        JSON.stringify({ name: finalName })
      );

      if (!createSite.body?.id) {
        return res.status(500).json({
          error: "Gagal buat site: " + JSON.stringify(createSite.body),
        });
      }

      const siteId = createSite.body.id;
      const siteUrl = createSite.body.ssl_url || createSite.body.url;

      // 2. Siapkan ZIP
      const ext = path.extname(uploadedFile.originalFilename || "").toLowerCase();
      let zipBuffer;

      if (ext === ".zip") {
        zipBuffer = fs.readFileSync(uploadedFile.path);
      } else {
        // HTML → bungkus jadi zip manual pake archiver
        const archiver = require("archiver");
        const zipPath = path.join(os.tmpdir(), `noxvus-${uid}.zip`);

        await new Promise((resolve, reject) => {
          const output = fs.createWriteStream(zipPath);
          const archive = archiver("zip", { zlib: { level: 6 } });
          archive.on("error", reject);
          output.on("close", resolve);
          archive.pipe(output);
          archive.file(uploadedFile.path, { name: "index.html" });
          archive.finalize();
        });

        zipBuffer = fs.readFileSync(zipPath);
        fs.unlinkSync(zipPath);
      }

      // 3. Deploy zip
      const deploy = await uploadZip(siteId, zipBuffer);

      if (deploy.body?.error_message) {
        return res.status(500).json({ error: "Deploy gagal: " + deploy.body.error_message });
      }

      return res.status(200).json({
        success: true,
        site_url: siteUrl,
        site_name: finalName,
        deploy_id: deploy.body?.id || null,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  });
};

export const config = { api: { bodyParser: false } };
