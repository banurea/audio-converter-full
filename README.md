# Audio Converter OGG - Best Audio Update

Fitur utama:
- Convert YouTube/direct audio/upload file ke `.ogg`.
- Spotify link: metadata + preview resmi jika tersedia. Spotify full song tidak bisa di-download lewat API resmi.
- Upload file audio/video.
- Advanced setting:
  - Speed audio.
  - Amplify dB.
  - Mode `CHIPMUNK / DEEP`: speed naik membuat vokal tinggi/melingking, speed turun membuat vokal rendah/deep.
  - Mode `TEMPO ONLY`: speed berubah tapi pitch vokal tetap natural.
  - Clean / Anti Kresek: limiter + dynamic normalize agar tidak clipping.
  - Max OGG Quality.
- Recommended Roblox PlaybackSpeed otomatis.

## Install

```cmd
npm install
copy .env.example .env
npm start
```

Buka:

```text
http://localhost:3000
```

## Wajib ada

- Node.js 18+
- FFmpeg
- yt-dlp

Cek:

```cmd
ffmpeg -version
yt-dlp --version
```

## Setting terbaik agar tidak kresek

- Biarkan `CLEAN / ANTI KRESEK` aktif.
- Biarkan `MAX OGG QUALITY` aktif.
- Jangan amplify terlalu besar. Untuk file yang sudah keras, pakai `-4dB` sampai `0dB`.
- Kalau masih pecah, turunkan amplify ke `-6dB` atau `-8dB`.

## Mode suara

- Pakai `CHIPMUNK / DEEP` kalau ingin vokal ikut tinggi/rendah.
- Pakai `TEMPO ONLY` kalau ingin cuma durasi/speed berubah tanpa suara melingking.


## Catatan penting tentang deteksi musik original
Project ini tidak dibuat untuk menyamarkan lagu agar lolos copyright/original-music detection. Fitur Clean Master hanya untuk kualitas audio: mengurangi clipping, kresek, noise ringan, dan menjaga OGG tetap halus.

Agar aman untuk Roblox atau platform lain, gunakan audio yang kamu punya haknya: karya sendiri, royalty-free dengan lisensi yang sesuai, atau audio yang memang boleh diupload ulang.

## Setting audio paling aman
- Pitch mode: CHIPMUNK / DEEP jika ingin vokal ikut tinggi/rendah.
- Amplify: -8 dB sampai -4 dB untuk mencegah pecah.
- CLEAN / ANTI KRESEK: ON.
- MAX OGG QUALITY: ON.
- CLEAN MASTER: ON untuk noise ringan, OFF jika hasil terasa terlalu tipis.
