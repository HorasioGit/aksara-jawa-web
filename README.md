# Baca Aksara Jawa ꦲꦤꦕꦫꦏ

Aplikasi web untuk membaca tulisan tangan aksara Jawa. Pengguna bisa mengunggah foto atau menulis langsung di layar, lalu model akan:

- **mengenali satu aksara** dari 20 aksara dasar hanacaraka, atau
- **membaca satu baris aksara** dan menuliskannya kembali dalam huruf Latin (misalnya ꦧꦕꦢ menjadi `ba-ca-da`).

Seluruh proses, mulai dari preprocessing gambar sampai inferensi model, berjalan langsung di browser pengguna. Tidak ada server backend, dan gambar tidak dikirim ke mana pun.

## Model

| Tugas | Arsitektur | Data latih | Hasil validasi |
|---|---|---|---|
| Klasifikasi aksara tunggal | ResNet-34d (transfer learning dari ImageNet) + TTA 4 view | ±10.000 gambar, 20 kelas | Akurasi 99,40%, macro-F1 99,49% |
| OCR deretan aksara | CRNN (7 lapis CNN + BiLSTM 2 lapis) dengan CTC loss, dilatih dari awal | ±3.000 gambar + data sintetis | Exact match 96,1%, SER 1,07%, CER 0,72% |

Validasi OCR dipisah per string, sehingga kalimat di data validasi tidak pernah muncul saat training.
SER (syllable error rate) dihitung per suku kata, sedangkan CER per huruf Latin.

## Cara kerja

1. **Preprocessing**: gambar diubah ke grayscale, pencahayaan diratakan (estimasi latar dengan dilasi dan median blur), area tulisan dipotong dengan threshold Otsu dan connected components, lalu ukurannya disamakan (128×128 untuk klasifikasi, tinggi 64 px untuk OCR).
2. **Inferensi**: model ONNX dijalankan dengan onnxruntime-web (WebAssembly).
3. **Dekode**: klasifikasi menampilkan tiga kandidat teratas; OCR memakai dekode CTC greedy dan menampilkan keyakinan per suku kata.

Preprocessing di browser (opencv.js) adalah port langsung dari pipeline Python saat training, dan hasilnya identik piksel per piksel.

## Teknologi

- Next.js 15, React 19, TypeScript
- onnxruntime-web, opencv.js
- Training: PyTorch, timm (di Kaggle)

## Menjalankan secara lokal

Butuh Node.js 18 atau lebih baru.

```bash
npm install
npm run dev
```

Buka http://localhost:3000

## Struktur

```
app/            halaman utama dan gaya tampilan
components/     ilustrasi gunungan (SVG) dan kanvas menulis
lib/engine.ts   memuat model dan menjalankan prediksi
lib/preprocess.js  preprocessing gambar (opencv.js)
public/models/  model ONNX, dipecah per 5 MB (daftar di models.json)
public/vendor/  onnxruntime-web dan opencv.js
tools/          skrip konversi bobot PyTorch (.pt) ke ONNX
```

## Keterbatasan

- Hanya aksara dasar (nglegena). Sandhangan, pasangan, dan angka Jawa belum dikenali.
- Mode baris membaca satu baris tulisan; gambar berisi beberapa baris perlu dipotong dulu.
- Model dilatih dari tulisan pena di kertas, jadi tulisan di layar atau foto dengan kondisi sangat berbeda bisa menurunkan akurasi.
