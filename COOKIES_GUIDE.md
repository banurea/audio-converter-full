# Panduan lengkap pakai cookies untuk yt-dlp di Render

## 1) Buka YouTube di browser Anda
Pastikan Anda sudah login ke akun YouTube yang bisa mengakses video yang ingin didownload.

## 2) Instal ekstensi export cookies
Gunakan salah satu ekstensi browser berikut:
- Get cookies.txt LOCALLY
- Cookies.txt by Chen
- EditThisCookie

## 3) Export cookies ke file
1. Buka YouTube di browser.
2. Klik ekstensi cookies.
3. Pilih semua cookies atau cookies untuk domain youtube.com.
4. Export ke file bernama `cookies.txt`.

## 4) Simpan file di project
Letakkan file tersebut di folder project Anda, misalnya:
- [cookies.txt](cookies.txt)

Pastikan isinya adalah format Netscape cookies, contoh:

```text
# Netscape HTTP Cookie File
.example.com	TRUE	/	FALSE	0	foo	bar
```

## 5) Tambahkan environment variable di Render
Di dashboard Render, buka service Anda lalu tambahkan:
- Key: `YT_DLP_COOKIES_FILE`
- Value: `/app/cookies.txt`

## 6) Pastikan file ikut ke container
Karena Render memakai Docker, file `cookies.txt` harus ada di repo atau di build context proyek.

## 7) Redeploy
Setelah itu lakukan redeploy ulang di Render.

## 8) Kalau masih tidak berhasil
- Coba gunakan akun YouTube yang sudah login.
- Pastikan video bukan private/age-restricted.
- Coba gunakan video lain yang tidak diblokir.
- Pastikan file cookies benar-benar diexport dari browser.
