let fileBlob = null;
let chart = null;

const fileInput  = document.getElementById('fileInput');
const chooseBtn  = document.getElementById('chooseBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const dropzone   = document.getElementById('dropzone');
const previewImg = document.getElementById('previewImg');
const loadingEl  = document.getElementById('loading');
const errorBox   = document.getElementById('errorBox');

const predClass  = document.getElementById('predClass');
const predConf   = document.getElementById('predConf');
const latency    = document.getElementById('latency');

chooseBtn.onclick = () => fileInput.click();
fileInput.onchange = (e) => handleFile(e.target.files[0]);

// Drag & drop
;['dragenter','dragover'].forEach(evt => dropzone.addEventListener(evt, e=>{
  e.preventDefault(); e.stopPropagation(); dropzone.classList.add('hover');
}));
;['dragleave','drop'].forEach(evt => dropzone.addEventListener(evt, e=>{
  e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('hover');
}));
dropzone.addEventListener('drop', e=>{
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

function handleFile(f){
  if(!f) return;
  const ok = ['image/png','image/jpeg','image/jpg','image/bmp'].includes(f.type) || /\.(png|jpg|jpeg|bmp)$/i.test(f.name);
  if(!ok){ showError('File không hợp lệ. Chỉ nhận PNG/JPG/JPEG/BMP.'); return; }
  fileBlob = f;
  const reader = new FileReader();
  reader.onload = e => {
    previewImg.src = e.target.result;
    previewImg.style.display = 'block';
    analyzeBtn.disabled = false;
    hideError();
  };
  reader.readAsDataURL(f);
}

analyzeBtn.onclick = async ()=>{
  if(!fileBlob) return;
  setLoading(true);
  try{
    const fd = new FormData();
    fd.append('file', fileBlob, fileBlob.name);
    const res = await fetch('/predict', { method:'POST', body: fd });
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'Lỗi không xác định');
    // Update result
    predClass.textContent = 'KL' + data.class;
    predConf.textContent  = (data.confidence*100).toFixed(1) + '%';
    latency.textContent   = data.inference_ms.toFixed(1);

    // Draw chart
    drawChart(data.classes, data.probs);
  }catch(err){
    showError(err.message);
  }finally{
    setLoading(false);
  }
};

function drawChart(labels, probs){
  const ctx = document.getElementById('probChart').getContext('2d');
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l=>'KL'+l),
      datasets: [{
        label: 'Xác suất',
        data: probs.map(p=>(p*100).toFixed(2)),
      }]
    },
    options: {
      responsive:true,
      scales:{
        y:{ beginAtZero:true, ticks:{ callback:(v)=> v+'%' } }
      },
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label:(c)=>` ${c.parsed.y}%` } }
      },
      animation:{ duration:700 }
    }
  });
}

function setLoading(isLoading){
  analyzeBtn.disabled = isLoading || !fileBlob;
  loadingEl.classList.toggle('hidden', !isLoading);
}

function showError(msg){
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}
function hideError(){
  errorBox.classList.add('hidden');
}
