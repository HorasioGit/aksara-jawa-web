'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Gunungan from '@/components/Gunungan';
import DrawPad, { type DrawPadHandle } from '@/components/DrawPad';
import { HANACARAKA, JAVANESE, loadModel, predict, type Mode, type Result } from '@/lib/engine';

type Source = 'upload' | 'draw';

const MODES: Record<Mode, { label: string; action: string; hint: string }> = {
  aksara: { label: 'Satu aksara', action: 'Kenali aksara', hint: 'Satu aksara per gambar, misalnya ꦲ atau ꦤ.' },
  ocr: { label: 'Satu baris', action: 'Baca tulisan', hint: 'Satu baris aksara, dibaca dari kiri ke kanan.' },
};

const pct = (x: number) => `${(x * 100).toFixed(x > 0.995 ? 0 : 1)}%`;

export default function Home() {
  const [mode, setMode] = useState<Mode>('aksara');
  const [source, setSource] = useState<Source>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [padEmpty, setPadEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const padRef = useRef<DrawPadHandle>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Unduh model di latar belakang begitu mode dipilih, supaya tombol terasa instan
  useEffect(() => {
    let alive = true;
    setProgress(0);
    loadModel(mode, (p) => alive && setProgress(p))
      .then(() => alive && setProgress(null))
      .catch(() => alive && setProgress(null));
    return () => { alive = false; };
  }, [mode]);

  const pickFile = useCallback((f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Pilih file gambar (JPG, PNG, atau sejenisnya).'); return; }
    setError(null);
    setResult(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }, []);

  const onPadChange = useCallback((empty: boolean) => { setPadEmpty(empty); if (empty) setResult(null); }, []);

  const ready = source === 'upload' ? !!file : !padEmpty;

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const src = source === 'upload' ? file! : padRef.current!.canvas!;
      const r = await predict(mode, src);
      setResult(r);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    } catch (e) {
      console.error(e);
      setError('Gambar tidak bisa diproses. Coba gambar lain, atau muat ulang halaman jika model belum terunduh.');
    } finally {
      setBusy(false);
    }
  };

  const lowConf = result?.kind === 'ocr' && result.tokens.some((t) => t.confidence < 0.6);

  return (
    <>
      <header className="hero">
        <div className="hero-text">
          <p className="mark" aria-hidden>ꦲꦤꦕꦫꦏ</p>
          <h1>Baca tulisan tangan aksara Jawa</h1>
          <p className="lead">
            Unggah foto atau tulis langsung di layar. Model mengenali satu aksara, atau membaca satu baris
            aksara dan menuliskannya kembali dalam huruf Latin.
          </p>
          <p className="lead small">Semua proses berjalan di perangkatmu. Gambar tidak dikirim ke mana pun.</p>
        </div>
        <Gunungan className="gunungan" />
      </header>

      <main>
        <section className="kelir" aria-label="Alat pembaca aksara">
          <div className="controls">
            <div className="seg" role="radiogroup" aria-label="Jenis tulisan">
              {(Object.keys(MODES) as Mode[]).map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''}
                  disabled={busy} onClick={() => { setMode(m); setResult(null); setError(null); }}>
                  {MODES[m].label}
                </button>
              ))}
            </div>
            <div className="seg quiet" role="radiogroup" aria-label="Sumber gambar">
              <button role="radio" aria-checked={source === 'upload'} className={source === 'upload' ? 'on' : ''}
                disabled={busy} onClick={() => { setSource('upload'); setResult(null); }}>Unggah foto</button>
              <button role="radio" aria-checked={source === 'draw'} className={source === 'draw' ? 'on' : ''}
                disabled={busy} onClick={() => { setSource('draw'); setResult(null); }}>Tulis sendiri</button>
            </div>
          </div>
          <p className="hint">{MODES[mode].hint}</p>

          {source === 'upload' ? (
            <div
              className={`drop ${dragging ? 'dragging' : ''} ${preview ? 'filled' : ''}`}
              role="button" tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Gambar yang dipilih" />
              ) : (
                <div className="drop-empty">
                  <strong>Pilih foto atau seret ke sini</strong>
                  <span>Di HP, kamu bisa langsung memotret tulisan. Potong foto supaya hanya berisi tulisan.</span>
                </div>
              )}
              <input ref={inputRef} type="file" accept="image/*" hidden
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          ) : (
            <DrawPad ref={padRef} mode={mode} onChange={onPadChange} />
          )}

          <div className="actions">
            {progress !== null && (
              <span className="loading" role="status">
                Menyiapkan model{progress > 0 ? ` ${Math.round(progress * 100)}%` : ''}
                <span className="bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span>
              </span>
            )}
            {source === 'upload' && file && (
              <button className="btn ghost" disabled={busy} onClick={() => inputRef.current?.click()}>Ganti foto</button>
            )}
            <button className="btn" disabled={!ready || busy} onClick={run}>
              {busy ? 'Membaca…' : MODES[mode].action}
            </button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}

          <div ref={resultRef} aria-live="polite">
            {result?.kind === 'aksara' && (
              <div className="result" key={result.processed}>
                <div className="shadow-stage">
                  <span className="shadow-glyph">{result.top[0].aksara}</span>
                </div>
                <div className="result-body">
                  <p className="latin-big">{result.top[0].label}</p>
                  <p className="conf">Keyakinan {pct(result.top[0].confidence)}</p>
                  <ul className="cands" aria-label="Kandidat lain">
                    {result.top.slice(1).map((t) => (
                      <li key={t.label}>
                        <span className="jv">{t.aksara}</span>
                        <span>{t.label}</span>
                        <span className="cand-p">{pct(t.confidence)}</span>
                      </li>
                    ))}
                  </ul>
                  {result.top[0].confidence < 0.6 && (
                    <p className="note">Model ragu. Coba foto yang lebih jelas, atau tulis ulang dengan goresan yang lebih tegas.</p>
                  )}
                </div>
              </div>
            )}

            {result?.kind === 'ocr' && (
              <div className="result ocr" key={result.processed}>
                {result.tokens.length === 0 ? (
                  <p className="note">Belum ada aksara yang terbaca. Pastikan gambar berisi satu baris tulisan yang jelas.</p>
                ) : (
                  <>
                    <div className="shadow-stage wide">
                      <span className="shadow-line">{result.tokens.map((t) => t.aksara).join('')}</span>
                    </div>
                    <p className="latin-line">{result.tokens.map((t) => t.label).join('-')}</p>
                    <p className="conf">
                      {result.tokens.length} suku kata, ditulis rangkai: <code>{result.tokens.map((t) => t.label).join('')}</code>
                    </p>
                    <ol className="syl" aria-label="Per suku kata">
                      {result.tokens.map((t, i) => (
                        <li key={i} className={t.confidence < 0.6 ? 'doubt' : ''} title={`Keyakinan ${pct(t.confidence)}`}>
                          <span className="jv">{t.aksara}</span>
                          <span>{t.label}</span>
                        </li>
                      ))}
                    </ol>
                    {lowConf && <p className="note">Suku kata bergaris merah dibaca dengan keyakinan rendah, cek kembali.</p>}
                  </>
                )}
              </div>
            )}

            {result && (
              <details className="peek">
                <summary>Lihat gambar yang dibaca model</summary>
                <p>Latar diratakan, tulisan dipotong, lalu ukurannya disamakan seperti saat model dilatih. Diproses dalam {result.ms} ms.</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.processed} alt="Gambar setelah diproses" className={`peek-img ${result.kind}`} />
              </details>
            )}
          </div>
        </section>

        <section className="aksara-table" aria-labelledby="t-title">
          <h2 id="t-title">Dua puluh aksara yang dikenali</h2>
          <p className="sub">Urutan hanacaraka. Model ini membaca aksara dasar (nglegena), belum termasuk sandhangan dan pasangan.</p>
          <div className="grid">
            {HANACARAKA.flat().map((s) => (
              <div key={s} className="cell">
                <span className="jv">{JAVANESE[s]}</span>
                <span className="lat">{s}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="how" aria-labelledby="h-title">
          <h2 id="h-title">Cara kerjanya</h2>
          <ol>
            <li>
              <h3>Gambar dirapikan</h3>
              <p>Bayangan dan warna kertas diratakan, lalu area tulisan dipotong otomatis.</p>
            </li>
            <li>
              <h3>Model membaca</h3>
              <p>Satu aksara dikenali oleh ResNet-34d. Satu baris dibaca oleh CRNN, gabungan CNN dan BiLSTM yang dilatih dengan CTC.</p>
            </li>
            <li>
              <h3>Hasil ditampilkan</h3>
              <p>Aksara ditulis ulang dalam huruf Latin, lengkap dengan tingkat keyakinan model untuk tiap aksara.</p>
            </li>
          </ol>
        </section>
      </main>

      <footer className="foot">
        <p>Dilatih dengan sekitar 10 ribu gambar aksara tunggal dan 3 ribu gambar deretan aksara tulisan tangan.</p>
      </footer>
    </>
  );
}
