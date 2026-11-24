"""Konversi bobot hasil training (.pt) ke model ONNX untuk web.

Dipakai kalau kamu training ulang (misal tanpa pretrained). Jalankan di Kaggle atau Colab:

    pip install timm onnx onnxruntime onnxscript
    python export_onnx.py --cls cls_resnet34d_f0.pt --ocr ocr_crnn.pt --out .

Hasilnya folder `models/` berisi potongan model (maks 5 MB per file, supaya bisa diunggah
lewat web GitHub) dan models.json. Ganti seluruh isi public/models/ dengan isi folder itu,
lalu naikkan MODEL_VERSION di lib/engine.ts supaya browser pengunjung mengunduh versi baru.
Arsitektur di bawah harus sama dengan notebook (CLS_MODEL='resnet34d', CLS_IMG=128, OCR_H=64).
"""
import argparse
import json
from pathlib import Path

import numpy as np
import onnx
import timm
import torch
import torch.nn as nn
import torch.nn.functional as F
from onnx import TensorProto, helper, numpy_helper
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.shape_inference import quant_pre_process
from torchvision.transforms.v2.functional._geometry import _get_inverse_affine_matrix

CLS_MODEL, CLS_IMG, OCR_H, N_CLS = 'resnet34d', 128, 64, 20
PART_SIZE = 5 * 1024 * 1024


def conv_bn(i, o):
    return nn.Sequential(nn.Conv2d(i, o, 3, 1, 1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True))


class CRNN(nn.Module):
    def __init__(self, n_cls, hidden=256):
        super().__init__()
        self.cnn = nn.Sequential(
            conv_bn(1, 64), nn.MaxPool2d(2, 2),
            conv_bn(64, 128), nn.MaxPool2d(2, 2),
            conv_bn(128, 256), conv_bn(256, 256), nn.MaxPool2d((2, 1)),
            conv_bn(256, 384), conv_bn(384, 384), nn.MaxPool2d((2, 1)),
            conv_bn(384, 384), nn.Dropout2d(0.1))
        self.proj = nn.Linear(384 * (OCR_H // 16), 384)
        self.rnn = nn.LSTM(384, hidden, num_layers=2, bidirectional=True, batch_first=True, dropout=0.25)
        self.fc = nn.Linear(hidden * 2, n_cls + 1)

    def forward(self, x):
        f = self.cnn(x).permute(0, 3, 1, 2).flatten(2)
        o, _ = self.rnn(F.relu(self.proj(f)))
        return self.fc(o)


def affine_grid(angle, scale, S=CLS_IMG):
    # grid yang sama dengan torchvision TF.affine (TTA di notebook)
    m = _get_inverse_affine_matrix([0.0, 0.0], angle, [0, 0], scale, [0.0, 0.0])
    theta = torch.tensor(m, dtype=torch.float32).reshape(1, 2, 3)
    base = torch.empty(1, S, S, 3)
    xs = torch.linspace(-S * 0.5 + 0.5, S * 0.5 - 0.5, S)
    base[..., 0].copy_(xs)
    base[..., 1].copy_(xs.unsqueeze(-1))
    base[..., 2].fill_(1)
    return base.view(1, S * S, 3).bmm(theta.transpose(1, 2) / torch.tensor([0.5 * S, 0.5 * S])).view(1, S, S, 2)


class ClsTTA(nn.Module):
    """Klasifikasi + TTA 4 view (asli, skala 0.92, rotasi +4, rotasi -4), output probabilitas rata-rata."""

    def __init__(self, m):
        super().__init__()
        self.m = m
        self.register_buffer('grids', torch.cat([affine_grid(0, 0.92), affine_grid(4, 1.0), affine_grid(-4, 1.0)]))

    def forward(self, x):
        views = F.grid_sample(x.expand(3, -1, -1, -1), self.grids, mode='nearest',
                              padding_mode='zeros', align_corners=False)
        return self.m(torch.cat([x, views])).softmax(1).mean(0, keepdim=True)


class OcrProb(nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, x):
        return self.m(x).softmax(-1)


def fp16_weights(src, dst):
    """Simpan bobot dalam fp16 (ukuran setengah), perhitungan tetap fp32."""
    m = onnx.load(src)
    g = m.graph
    inits, casts = [], []
    for init in g.initializer:
        a = numpy_helper.to_array(init)
        if a.dtype == np.float32 and a.size >= 1024:
            inits.append(numpy_helper.from_array(a.astype(np.float16), init.name + '_fp16'))
            casts.append(helper.make_node('Cast', [init.name + '_fp16'], [init.name], to=TensorProto.FLOAT))
        else:
            inits.append(init)
    del g.initializer[:]
    g.initializer.extend(inits)
    nodes = list(g.node)
    del g.node[:]
    g.node.extend(casts + nodes)
    onnx.save(m, dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cls', required=True)
    ap.add_argument('--ocr', required=True)
    ap.add_argument('--out', default='.')
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    cls = timm.create_model(CLS_MODEL, pretrained=False, num_classes=N_CLS, in_chans=1, drop_rate=0.2)
    cls.load_state_dict(torch.load(a.cls, map_location='cpu', weights_only=True))
    ocr = CRNN(N_CLS)
    ocr.load_state_dict(torch.load(a.ocr, map_location='cpu', weights_only=True))
    tta = ClsTTA(cls.eval()).eval()
    ocrp = OcrProb(ocr.eval()).eval()

    tmp_c, tmp_o, pre = out / '_cls_fp32.onnx', out / '_ocr_fp32.onnx', out / '_cls_pre.onnx'
    torch.onnx.export(tta, torch.rand(1, 1, CLS_IMG, CLS_IMG), tmp_c, input_names=['input'],
                      output_names=['probs'], opset_version=17, dynamo=False)
    torch.onnx.export(ocrp, torch.rand(1, 1, OCR_H, 400), tmp_o, input_names=['input'], output_names=['probs'],
                      opset_version=17, dynamic_axes={'input': {3: 'width'}, 'probs': {1: 'time'}}, dynamo=False)

    # klasifikasi: int8 dinamis (~22 MB); OCR: bobot fp16 (~16 MB)
    quant_pre_process(str(tmp_c), str(pre))
    quantize_dynamic(str(pre), str(out / 'aksara-cls.onnx'), weight_type=QuantType.QUInt8,
                     extra_options={'DefaultTensorType': TensorProto.FLOAT})
    fp16_weights(str(tmp_o), str(out / 'aksara-ocr.onnx'))
    for p in [tmp_c, tmp_o, pre]:
        p.unlink(missing_ok=True)

    # pecah jadi potongan 5 MB + daftar potongan (dibaca oleh lib/engine.ts)
    mdir = out / 'models'
    mdir.mkdir(exist_ok=True)
    manifest = {}
    for name in ['aksara-cls.onnx', 'aksara-ocr.onnx']:
        data = (out / name).read_bytes()
        n = 0
        for i in range(0, len(data), PART_SIZE):
            (mdir / f'{name}.{n:03d}').write_bytes(data[i:i + PART_SIZE])
            n += 1
        manifest[name] = {'parts': n, 'bytes': len(data)}
        (out / name).unlink()
    (mdir / 'models.json').write_text(json.dumps(manifest, indent=2))
    print('Selesai. Salin seluruh isi folder', mdir, 'ke public/models/')


if __name__ == '__main__':
    main()
