"""
KlaimGuard AI - Generator data klaim sintetis (FKRTL).

Struktur meniru klaim INA-CBG secara garis besar. BUKAN data JKN riil.
Label fraud (fraud_label, fraud_type) hanya untuk evaluasi/pelatihan supervised
pada data sintetis; tidak boleh dipakai sebagai fitur.

6 jenis fraud (sesuai checkbox form Healthkathon):
  phantom, repeat, upcoding, unbundling, inflated, cloning
"""
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

SEED = 42
N_FASKES = 120
N_PATIENTS = 25_000
N_NORMAL = 60_000
FRAUD_RATE = 0.045  # proporsi total klaim fraud (kira-kira)

rng = np.random.default_rng(SEED)

# --- Katalog diagnosis (kode ICD-10 disederhanakan) -----------------------
# (kode, nama, tipe, base_cost_juta, los_mean, severity_group, prosedur_valid)
DX = [
    ("A09", "Gastroenteritis", "RITL", 3.5, 3, "I", ["99.15", "96.07"]),
    ("A91", "DBD", "RITL", 5.0, 4, "I", ["99.04", "99.15"]),
    ("I10", "Hipertensi", "RJTL", 0.45, 0, "I", ["89.52"]),
    ("E11", "Diabetes melitus", "RJTL", 0.65, 0, "I", ["90.59", "89.52"]),
    ("J18", "Pneumonia", "RITL", 7.5, 5, "II", ["87.44", "99.15"]),
    ("I50", "Gagal jantung", "RITL", 12.0, 6, "II", ["88.72", "89.52"]),
    ("N39", "ISK", "RITL", 4.2, 3, "I", ["91.39"]),
    ("K35", "Apendisitis", "RITL", 9.5, 3, "II", ["47.09"]),
    ("O80", "Persalinan normal", "RITL", 5.5, 2, "I", ["73.59"]),
    ("O82", "Persalinan sesar", "RITL", 14.0, 4, "II", ["74.1"]),
    ("I21", "Infark miokard akut", "RITL", 24.0, 6, "III", ["36.06", "88.56"]),
    ("I63", "Stroke iskemik", "RITL", 19.0, 7, "III", ["87.03", "88.91"]),
    ("N18", "Gagal ginjal kronik", "RJTL", 1.1, 0, "II", ["39.95"]),
    ("C50", "Kanker payudara", "RITL", 22.0, 5, "III", ["85.41", "99.25"]),
    ("S72", "Fraktur femur", "RITL", 17.0, 6, "III", ["79.35", "81.51"]),
    ("J45", "Asma", "RJTL", 0.5, 0, "I", ["93.94"]),
    ("H25", "Katarak", "RJTL", 3.8, 0, "II", ["13.41"]),
    ("L30", "Dermatitis", "RJTL", 0.3, 0, "I", ["89.01"]),
    ("M54", "Nyeri punggung", "RJTL", 0.4, 0, "I", ["93.39"]),
    ("K29", "Gastritis", "RJTL", 0.35, 0, "I", ["89.01"]),
]
DX_DF = pd.DataFrame(DX, columns=["dx", "dx_name", "service_type", "base_cost", "los_mean", "severity", "procs"])
SEV_RANK = {"I": 1, "II": 2, "III": 3}
CLASS_MULT = {"A": 1.30, "B": 1.12, "C": 1.0, "D": 0.88}
CHRONIC = {"I10", "E11", "N18", "J45"}  # wajar sering kontrol ulang


def make_faskes():
    cls = rng.choice(list(CLASS_MULT), size=N_FASKES, p=[0.10, 0.30, 0.40, 0.20])
    return pd.DataFrame({
        "faskes_id": [f"RS{str(i).zfill(3)}" for i in range(N_FASKES)],
        "faskes_class": cls,
        "faskes_ownership": rng.choice(["Pemerintah", "Swasta"], size=N_FASKES, p=[0.55, 0.45]),
        "faskes_idio": rng.normal(1.0, 0.06, size=N_FASKES).clip(0.8, 1.25),  # kebiasaan tarif per faskes
        "faskes_volume_w": rng.dirichlet(np.ones(N_FASKES) * 1.5),
    })


def split_components(total, service_type):
    """Pecah total biaya jadi komponen (porsi acak, berbeda RJTL/RITL)."""
    if service_type == "RITL":
        base = np.array([0.22, 0.30, 0.25, 0.15, 0.08])
    else:
        base = np.array([0.00, 0.35, 0.40, 0.15, 0.10])
    p = rng.dirichlet(base * 60 + 1e-3)
    return total * p  # room, procedure, drug, lab_rad, other


def gen_normal(faskes):
    dates0 = pd.Timestamp("2025-01-01")
    n = N_NORMAL
    fk = faskes.sample(n, replace=True, weights="faskes_volume_w", random_state=SEED).reset_index(drop=True)
    dxi = rng.integers(0, len(DX_DF), size=n)
    d = DX_DF.iloc[dxi].reset_index(drop=True)
    patient = rng.integers(0, N_PATIENTS, size=n)
    day = rng.integers(0, 365, size=n)
    admit = dates0 + pd.to_timedelta(day, unit="D")
    los = np.where(d["service_type"] == "RITL",
                   np.maximum(1, rng.poisson(d["los_mean"].clip(lower=1))), 0)
    discharge = admit + pd.to_timedelta(los, unit="D")
    noise = rng.lognormal(0, 0.18, size=n)
    los_adj = np.where(los > 0, 0.7 + 0.3 * los / d["los_mean"].clip(lower=1), 1.0)
    total = d["base_cost"].values * 1e6 * fk["faskes_class"].map(CLASS_MULT).values \
        * fk["faskes_idio"].values * noise * los_adj
    proc = [rng.choice(p) for p in d["procs"]]
    comps = np.vstack([split_components(t, s) for t, s in zip(total, d["service_type"])])
    df = pd.DataFrame({
        "patient_id": [f"P{str(p).zfill(5)}" for p in patient],
        "faskes_id": fk["faskes_id"], "faskes_class": fk["faskes_class"],
        "faskes_ownership": fk["faskes_ownership"],
        "service_type": d["service_type"], "dx": d["dx"], "severity": d["severity"],
        "proc": proc, "admit_date": admit, "discharge_date": discharge, "los": los,
        "cost_room": comps[:, 0], "cost_procedure": comps[:, 1], "cost_drug": comps[:, 2],
        "cost_labrad": comps[:, 3], "cost_other": comps[:, 4],
        "fraud_label": 0, "fraud_type": "none",
    })
    return df


def total_of(df):
    return df[["cost_room", "cost_procedure", "cost_drug", "cost_labrad", "cost_other"]].sum(axis=1)


COST_COLS = ["cost_room", "cost_procedure", "cost_drug", "cost_labrad", "cost_other"]


def tag(df, kind):
    df = df.copy()
    df["fraud_label"] = 1
    df["fraud_type"] = kind
    return df


def inject_fraud(normal, faskes):
    total_fraud = int(len(normal) * FRAUD_RATE / (1 - FRAUD_RATE))
    share = {"phantom": 0.17, "repeat": 0.17, "upcoding": 0.20,
             "unbundling": 0.15, "inflated": 0.19, "cloning": 0.12}
    out = []
    # faskes "nakal": fraud terkonsentrasi di sebagian faskes (realistis)
    bad = faskes.sample(frac=0.15, random_state=SEED)["faskes_id"].tolist()
    bad_set = set(bad)

    def pick(n, from_bad=0.65):
        pool = normal[normal.fraud_label == 0]
        nb = int(n * from_bad)
        a = pool[pool.faskes_id.isin(bad_set)].sample(nb, replace=True, random_state=int(rng.integers(1e9)))
        b = pool.sample(n - nb, replace=True, random_state=int(rng.integers(1e9)))
        r = pd.concat([a, b]).reset_index(drop=True)
        # acak ulang pasien & tanggal: cegah fraud menjadi duplikat klaim normal (kebocoran label)
        r["patient_id"] = [f"P{str(p).zfill(5)}" for p in rng.integers(0, N_PATIENTS, size=len(r))]
        r["admit_date"] = pd.Timestamp("2025-01-01") + pd.to_timedelta(rng.integers(0, 365, size=len(r)), unit="D")
        r["discharge_date"] = r["admit_date"] + pd.to_timedelta(r["los"], unit="D")
        return r

    # 1) INFLATED: komponen biaya digelembungkan, intensitas acak 1.25-3.0x
    n = int(total_fraud * share["inflated"])
    f = pick(n)
    mult = rng.uniform(1.25, 3.0, size=n)
    which = rng.choice(["drug", "other", "procedure", "all"], size=n, p=[0.35, 0.25, 0.2, 0.2])
    for i in range(n):
        if which[i] == "all":
            f.loc[i, COST_COLS] = f.loc[i, COST_COLS].values * mult[i] ** 0.6
        else:
            c = {"drug": "cost_drug", "other": "cost_other", "procedure": "cost_procedure"}[which[i]]
            f.loc[i, c] = f.loc[i, c] * mult[i]
    out.append(tag(f, "inflated"))

    # 2) UPCODING: diagnosis diganti severity lebih tinggi, prosedur tetap (mismatch dx-proc)
    n = int(total_fraud * share["upcoding"])
    f = pick(n)
    new_dx, new_sev, mult = [], [], []
    for i in range(n):
        cur = SEV_RANK[f.loc[i, "severity"]]
        cands = DX_DF[(DX_DF.service_type == f.loc[i, "service_type"]) &
                      (DX_DF.severity.map(SEV_RANK) > cur)]
        if len(cands) == 0:  # tidak ada yg lebih tinggi di tipe yg sama -> tetap, tapi markup
            new_dx.append(f.loc[i, "dx"]); new_sev.append(f.loc[i, "severity"]); mult.append(rng.uniform(1.3, 1.8))
        else:
            c = cands.sample(1, random_state=int(rng.integers(1e9))).iloc[0]
            ratio = c.base_cost / DX_DF.loc[DX_DF.dx == f.loc[i, "dx"], "base_cost"].iloc[0]
            new_dx.append(c.dx); new_sev.append(c.severity)
            mult.append(float(np.clip(ratio * rng.uniform(0.6, 1.0), 1.15, 3.5)))
    f["dx"], f["severity"] = new_dx, new_sev  # proc TIDAK diganti -> tidak sesuai dx
    f[COST_COLS] = f[COST_COLS].values * np.array(mult)[:, None]
    out.append(tag(f, "upcoding"))

    # 3) CLONING: salin klaim lain di faskes yang sama, pasien beda, biaya nyaris identik
    n = int(total_fraud * share["cloning"])
    f = pick(n)
    f["patient_id"] = [f"P{str(p).zfill(5)}" for p in rng.integers(0, N_PATIENTS, size=n)]
    f[COST_COLS] = f[COST_COLS].values * rng.normal(1.0, 0.004, size=(n, 5))  # jitter sangat kecil
    out.append(tag(f, "cloning"))
    # sumber klon: tambahkan 'asli' dengan biaya persis sebelum jitter (klaim normal sudah ada di data normal)

    # 4) REPEAT: klaim berulang untuk pasien+dx+prosedur sama dalam 0-14 hari (non-kronis)
    n = int(total_fraud * share["repeat"])
    f = pick(n)
    f["admit_date"] = f["admit_date"] + pd.to_timedelta(rng.integers(0, 15, size=n), unit="D")
    f["discharge_date"] = f["admit_date"] + pd.to_timedelta(f["los"], unit="D")
    f[COST_COLS] = f[COST_COLS].values * rng.normal(1.0, 0.03, size=(n, 5))
    out.append(tag(f, "repeat"))
    # sumber: normal (asli) sudah ada; pasangan 'asli' yang sama dipastikan di bawah
    repeat_orig = f.copy()

    # 5) UNBUNDLING: satu paket dipecah jadi 2-3 klaim terpisah (faskes+pasien sama, tanggal berdekatan)
    n = int(total_fraud * share["unbundling"] / 2.5)
    base = pick(n)
    parts = []
    for i in range(n):
        k = int(rng.choice([2, 3], p=[0.6, 0.4]))
        cuts = rng.dirichlet(np.ones(k) * 2)
        for j in range(k):
            r = base.loc[[i]].copy()
            r[COST_COLS] = r[COST_COLS].values * cuts[j] * rng.uniform(1.0, 1.25)  # total sedikit > paket
            r["admit_date"] = r["admit_date"] + pd.Timedelta(days=int(rng.integers(0, 3)))
            r["discharge_date"] = r["admit_date"] + pd.to_timedelta(r["los"], unit="D")
            parts.append(r)
    f = pd.concat(parts).reset_index(drop=True)
    out.append(tag(f, "unbundling"))

    # 6) PHANTOM: klaim tanpa layanan nyata -> pasien sering "ada di 2 tempat sekaligus",
    #    faskes meledak di hari tertentu (burst), pasien 'hantu' hanya muncul sekali
    n = int(total_fraud * share["phantom"])
    f = pick(n, from_bad=0.8)
    ghost = [f"P{str(p).zfill(5)}" for p in rng.integers(N_PATIENTS, N_PATIENTS + 6000, size=n)]
    f[COST_COLS] = f[COST_COLS].values * rng.lognormal(0, 0.12, size=(n, 5))
    # separuh: pasien asli yang sedang dirawat di faskes lain pada tanggal sama (overlap mustahil)
    real_idx = rng.choice(n, size=n // 2, replace=False)
    f["patient_id"] = ghost
    pool = normal[(normal.service_type == "RITL")]
    for i in real_idx:
        src = pool.iloc[int(rng.integers(0, len(pool)))]
        f.loc[i, "patient_id"] = src.patient_id
        f.loc[i, "admit_date"] = src.admit_date + pd.Timedelta(days=int(rng.integers(0, 2)))
        f.loc[i, "discharge_date"] = f.loc[i, "admit_date"] + pd.Timedelta(days=int(f.loc[i, "los"]))
    # burst per faskes: klaim phantom dipadatkan ke 2-3 hari tertentu di faskes yang sama
    is_ghost = ~np.isin(np.arange(n), real_idx)
    burst_map = {fid: pd.Timestamp("2025-01-01") + pd.to_timedelta(rng.integers(0, 365, size=int(rng.integers(2, 4))), unit="D")
                 for fid in f["faskes_id"].unique()}
    for i in np.where(is_ghost & (rng.random(n) < 0.7))[0]:
        days = burst_map[f.loc[i, "faskes_id"]]
        f.loc[i, "admit_date"] = days[int(rng.integers(0, len(days)))]
    f["discharge_date"] = f["admit_date"] + pd.to_timedelta(f["los"], unit="D")
    out.append(tag(f, "phantom"))

    fraud = pd.concat(out).reset_index(drop=True)
    return fraud, repeat_orig


def drop_overlaps(df):
    """Pasien tidak mungkin dirawat inap di dua tempat sekaligus -> hapus tumpang tindih pada data normal."""
    r = df.sort_values(["patient_id", "admit_date"]).copy()
    keep = np.ones(len(r), dtype=bool)
    last_dis, last_pat = None, None
    for i, (pid, ad, dis, st) in enumerate(zip(r.patient_id, r.admit_date, r.discharge_date, r.service_type)):
        if st != "RITL":
            continue
        if pid == last_pat and last_dis is not None and ad < last_dis:
            keep[i] = False
            continue
        last_pat, last_dis = pid, dis
    return r[keep].sort_index().reset_index(drop=True)


def main():
    faskes = make_faskes()
    normal = gen_normal(faskes)
    normal = drop_overlaps(normal)

    fraud, repeat_orig = inject_fraud(normal, faskes)

    # Pastikan klaim "asli" untuk REPEAT ada (klaim yang terbayar lebih dulu): salinan normal dgn tanggal lebih awal
    orig = repeat_orig.copy()
    orig["fraud_label"], orig["fraud_type"] = 0, "none"
    orig[COST_COLS] = orig[COST_COLS].values * rng.normal(1.0, 0.012, size=(len(orig), 5))
    orig["admit_date"] = orig["admit_date"] - pd.to_timedelta(rng.integers(1, 15, size=len(orig)), unit="D")
    orig["discharge_date"] = orig["admit_date"] + pd.to_timedelta(orig["los"], unit="D")

    df = pd.concat([normal, orig, fraud]).reset_index(drop=True)
    df["claim_total"] = total_of(df)
    df[COST_COLS + ["claim_total"]] = df[COST_COLS + ["claim_total"]].round(0)
    df = df.sample(frac=1, random_state=SEED).reset_index(drop=True)
    df.insert(0, "claim_id", [f"C{str(i).zfill(6)}" for i in range(len(df))])
    df["admit_date"] = pd.to_datetime(df["admit_date"]).dt.date
    df["discharge_date"] = pd.to_datetime(df["discharge_date"]).dt.date
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(DATA_DIR / "claims_synthetic.csv", index=False)
    faskes.drop(columns=["faskes_volume_w", "faskes_idio"]).to_csv(DATA_DIR / "faskes.csv", index=False)
    print(f"Total klaim: {len(df):,} | faskes: {df.faskes_id.nunique()} | pasien unik: {df.patient_id.nunique():,}")
    print(f"Fraud: {df.fraud_label.sum():,} ({df.fraud_label.mean():.2%})")
    print(df.fraud_type.value_counts().to_string())


if __name__ == "__main__":
    main()
