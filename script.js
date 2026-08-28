// ---------- Light / Dark mode toggle ----------
(function(){
  const KEY = 'hiyori-theme';
  const root = document.documentElement;
  const saved = localStorage.getItem(KEY);
  const initial = saved || 'light';
  if (initial === 'dark') root.setAttribute('data-theme', 'dark');

  function replayBadgeAnim(){
    const shape = document.querySelector('.badge-shape');
    const check = document.querySelector('.badge-check');
    if(!shape || !check) return;
    // matiin dulu animasinya, paksa reflow, baru nyalain lagi biar keputer dari awal
    // NOTE: pakai getBoundingClientRect(), bukan offsetWidth -> soalnya elemen SVG (<path>)
    // gak punya offsetWidth, jadi reflow-nya gak ke-trigger kalau pakai offsetWidth
    shape.style.animation = 'none';
    check.style.animation = 'none';
    void shape.getBoundingClientRect();
    void check.getBoundingClientRect();
    shape.style.animation = '';
    check.style.animation = '';
  }

  window.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const sync = () => btn.setAttribute('aria-pressed', root.getAttribute('data-theme') === 'dark' ? 'true' : 'false');
    sync();
    btn.addEventListener('click', function(){
      const isDark = root.getAttribute('data-theme') === 'dark';
      if (isDark){
        root.removeAttribute('data-theme');
        localStorage.setItem(KEY, 'light');
      } else {
        root.setAttribute('data-theme', 'dark');
        localStorage.setItem(KEY, 'dark');
      }
      sync();
      replayBadgeAnim();
    });
  });
})();

// ---------- Selalu mulai dari atas tiap refresh (matiin scroll restoration browser) ----------
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

// ---------- Static QRIS diberikan user ----------
const STATIC_QRIS = "00020101021126610014COM.GO-JEK.WWW01189360091434044314310210G4044314310303UMI51440014ID.CO.QRIS.WWW0215ID10254303952810303UMI5204899953033605802ID5925HIYORI STORE, Digital & K6010MAJALENGKA61054546262070703A016304DCEA";

// ---------- CRC16-CCITT (FALSE), sesuai standar QRIS ----------
function crc16ccitt(str){
  let crc = 0xFFFF;
  for(let c = 0; c < str.length; c++){
    crc ^= (str.charCodeAt(c) << 8);
    for(let i = 0; i < 8; i++){
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// ---------- Ubah QRIS statis -> dinamis dengan nominal ----------
function buildDynamicQris(staticQris, nominal){
  // buang 4 karakter nilai CRC di paling belakang
  let base = staticQris.slice(0, -4);

  // buang juga tag "6304" (tag+panjang CRC) karena akan ditambahkan lagi setelah nominal disisipkan
  if(base.endsWith("6304")){
    base = base.slice(0, -4);
  }

  // tag 01 (Point of Initiation): 11 = statis -> 12 = dinamis
  base = base.replace("010211", "010212");

  // pecah tepat sebelum tag negara "5802ID" supaya tag jumlah (54) bisa disisipkan sebelumnya
  const parts = base.split("5802ID");
  if(parts.length < 2){
    throw new Error("Format QRIS tidak dikenali");
  }

  const amountStr = String(nominal);
  const amountTag = "54" + amountStr.length.toString().padStart(2, '0') + amountStr;

  let combined = parts[0] + amountTag + "5802ID" + parts.slice(1).join("5802ID") + "6304";
  const crc = crc16ccitt(combined);
  return combined + crc;
}

// ---------- UI logic ----------
const overlay = document.getElementById('overlay');
const openBtn = document.getElementById('openDonate');
const closeBtn = document.getElementById('closeModal');
const amountInput = document.getElementById('amountInput');
const quickWrap = document.getElementById('quickAmounts');
const amountHint = document.getElementById('amountHint');
const genBtn = document.getElementById('genBtn');
const genBtnLabel = genBtn.querySelector('.gen-btn-label');
const qrResult = document.getElementById('qrResult');
const qrAmountText = document.getElementById('qrAmountText');

function openModal(){ overlay.classList.add('show'); }
function closeModal(){ overlay.classList.remove('show'); }

openBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });

quickWrap.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-v]');
  if(!btn) return;
  [...quickWrap.children].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  amountInput.value = btn.dataset.v;
  validateAmount();
});

amountInput.addEventListener('input', () => {
  [...quickWrap.children].forEach(b => b.classList.remove('active'));
  validateAmount();
});

function validateAmount(){
  const v = parseInt(amountInput.value || "0", 10);
  if(!v || v < 1000){
    amountHint.textContent = "Minimal Rp1.000";
    amountHint.classList.add('err');
    return false;
  }
  amountHint.textContent = "Nominal oke, siap dibuatkan QR";
  amountHint.classList.remove('err');
  return true;
}

genBtn.addEventListener('click', () => {
  if(!validateAmount()) return;
  const nominal = parseInt(amountInput.value, 10);

  // tampilin animasi loading dulu di tombol
  genBtn.disabled = true;
  genBtn.classList.add('loading');
  genBtnLabel.textContent = "Membuat QRIS...";

  setTimeout(() => {
    let dynamicPayload;
    try{
      dynamicPayload = buildDynamicQris(STATIC_QRIS, nominal);
    }catch(err){
      amountHint.textContent = "Gagal membuat QRIS: " + err.message;
      amountHint.classList.add('err');
      genBtn.disabled = false;
      genBtn.classList.remove('loading');
      genBtnLabel.textContent = "Buat QRIS";
      return;
    }

    const qrcodeEl = document.getElementById('qrcode');
    qrcodeEl.innerHTML = "";
    new QRCode(qrcodeEl, {
      text: dynamicPayload,
      width: 200,
      height: 200,
      colorDark: "#0a0a0a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });

    // Library qrcodejs otomatis nempelin atribut "title" (isi payload QRIS mentah)
    // ke elemen img/canvas hasil generate, sehingga muncul sebagai tooltip saat hover.
    // Dihapus di sini biar payload QRIS gak bocor lewat tooltip.
    qrcodeEl.removeAttribute('title');
    qrcodeEl.querySelectorAll('[title]').forEach(el => el.removeAttribute('title'));

    qrAmountText.textContent = "Rp " + nominal.toLocaleString('id-ID');
    qrResult.classList.add('show');

    genBtn.disabled = false;
    genBtn.classList.remove('loading');
    genBtnLabel.textContent = "Buat QRIS";
  }, 1400);
});
