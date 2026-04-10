import multiparty from "multiparty";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import os from "os";

const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
        .slice(0, 30);

      const finalName = siteName
        ? `${siteName}-${uuidv4().split("-")[0]}`
        : `noxvus-${uuidv4().split("-")[0]}`;

      // 1. Create Netlify site
      const siteRes = await fetch("https://api.netlify.com/api/v1/sites", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NETLIFY_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: finalName }),
      });

      const siteData = await siteRes.json();
      if (!siteData.id) {
        return res.status(500).json({ error: "Gagal buat site Netlify: " + JSON.stringify(siteData) });
      }

      const siteId = siteData.id;
      const siteUrl = siteData.ssl_url || siteData.url;

      // 2. Prepare zip
      let zipPath;

      const ext = path.extname(uploadedFile.originalFilename || "").toLowerCase();

      if (ext === ".zip") {
        // Use zip directly
        zipPath = uploadedFile.path;
      } else {
        // Wrap HTML in zip
        zipPath = path.join(os.tmpdir(), `deploy-${uuidv4()}.zip`);
        await new Promise((resolve, reject) => {
          const output = fs.createWriteStream(zipPath);
          const archive = archiver("zip");
          archive.on("error", reject);
          output.on("close", resolve);
          archive.pipe(output);
          archive.file(uploadedFile.path, { name: "index.html" });
          archive.finalize();
        });
      }

      // 3. Deploy zip to Netlify
      const zipBuffer = fs.readFileSync(zipPath);

      const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NETLIFY_TOKEN}`,
          "Content-Type": "application/zip",
          "Content-Length": zipBuffer.length,
        },
        body: zipBuffer,
      });

      const deployData = await deployRes.json();

      if (deployData.error_message) {
        return res.status(500).json({ error: "Deploy gagal: " + deployData.error_message });
      }

      return res.status(200).json({
        success: true,
        site_url: siteUrl,
        site_name: finalName,
        deploy_id: deployData.id,
        admin_url: siteData.admin_url,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  });
}

export const config = { api: { bodyParser: false } };
