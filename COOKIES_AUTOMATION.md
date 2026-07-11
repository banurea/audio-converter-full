# Automasi cookies untuk yt-dlp

Tujuan: memungkinkan server memakai cookies terbaru tanpa edit manual setiap kali.

1. Cara kerja (recommended, reliable)

- Jalankan sebuah "uploader" otomatis di mesin yang kamu kontrol (VPS atau PC 24/7).
- Uploader ini mengekspor cookies dari browser (extension export atau headless login + export), lalu meng-simpan hasilnya ke tempat aman yang bisa di-fetch oleh service (mis. signed S3 URL, private endpoint, atau CI secret update API).
- Pada server (Render), jalankan `npm run update-cookies` secara berkala (cron job / scheduled job) yang mengambil cookies dari `Y T_DLP_COOKIES_URL` atau `YT_DLP_COOKIES_BASE64` lalu menulis `tmp/cookies.txt`.

2. Environment variables untuk `npm run update-cookies`

- `YT_DLP_COOKIES_URL` - URL yang mengembalikan isi cookies.txt (plain text). Gunakan signed S3 URL atau endpoint yang aman.
- atau `YT_DLP_COOKIES_BASE64` - isi file cookies yang sudah di-base64; script akan decode dan menulis file.

3. Contoh: schedule di Render

- Di Render, buat Cron Job yang menjalankan command (cron job/Background Worker):
  - `npm run update-cookies`
  - Set env `YT_DLP_COOKIES_URL=https://...signed-url...`

4. Cara otomatis meng-upload cookies dari mesin lokal (contoh, manual POC)

- Ekspor cookies dari browser ke file `cookies.txt`.
- Upload ke S3 (contoh):
  ```bash
  aws s3 cp cookies.txt s3://my-private-bucket/cookies.txt --acl private
  # generate presigned URL (valid 1h)
  aws s3 presign s3://my-private-bucket/cookies.txt --expires-in 3600
  ```
- Masukkan presigned URL ke env `YT_DLP_COOKIES_URL` di Render, dan jalankan `npm run update-cookies` sebagai cron.

5. Caveats

- Google/YouTube dapat merotasi cookies; apabila akun Google di-login dari device lain, session dapat invalid.
- Automasi login via headless browser mungkin kena deteksi/captcha and 2FA. Rekomendasi: gunakan account test dan solusi yang meminimalkan interaksi manusia.

6. Jika mau saya bantu

- Buatkan script uploader POC (Puppeteer) yang mengekspor cookies dan upload ke S3.
- Atau buatkan contoh GitHub Action / cron job yang memanggil endpoint private untuk update.
