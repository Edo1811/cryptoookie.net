    let balance = 500.00;
    let cookies = 0;
    let price = 100.00;
    let priceHistory = [price];
    let wallet = [];
    const PRICE_MIN = 10;
    const PRICE_MAX = 1000;

    let logAnchor = Math.log(price); // moving target to avoid sticking to $100
  
    function gaussian() {
      // Box–Muller: ~N(0,1)
      const u1 = Math.random() || 1e-9, u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }




    const priceEl = document.getElementById("price");
    const balanceEl = document.getElementById("balance");
    const cookiesEl = document.getElementById("cookies");
    const canvas = document.getElementById("graph");
    const ctx = canvas.getContext("2d");
    const walletBody = document.getElementById("walletBody");
    const qtySelect = document.getElementById("qtySelect");
    const buyBtn = document.getElementById("buyBtn");
    const sellBtn = document.getElementById("sellBtn");

    function updateDisplay() {
      priceEl.textContent = `$${price.toFixed(2)}`;
      balanceEl.textContent = balance.toFixed(2);
      cookiesEl.textContent = cookies.toFixed(4);
      updateActionState();
    }

    function fluctuatePrice() {
  // --- 30% typical move, band = 10..1000, no bottom gluing ---
  const logMin = Math.log(PRICE_MIN);
  const logMax = Math.log(PRICE_MAX);
  const logRange = logMax - logMin;

  let logP = Math.log(price);
  const pos = (logP - logMin) / logRange; // 0..1 within band

  // Target volatility: exp(±sigma) ≈ 1.3  → sigma ≈ ln(1.3) ≈ 0.262
  const SIGMA   = 0.262; // ~30% one-sigma move per tick
  const K       = 0.06;  // gentle mean-reversion to moving anchor
  const ALPHA   = 0.02;  // how fast anchor follows price (EMA in log space)
  const SIGMA_A = 0.01;  // tiny anchor wander so it doesn’t park

  // Update moving anchor (EMA of log-price + tiny random walk), keep off hard edges
  logAnchor = (1 - ALPHA) * logAnchor + ALPHA * logP + gaussian() * SIGMA_A;
  const margin = 0.06 * logRange;
  if (logAnchor < logMin + margin) logAnchor = logMin + margin;
  if (logAnchor > logMax - margin) logAnchor = logMax - margin;

  // Mild wall push so it escapes edges without giant jumps
  let wallPush = 0;
  if (pos < 0.15) wallPush = 0.04 * (0.15 - pos);    // push up near floor
  else if (pos > 0.85) wallPush = -0.04 * (pos - 0.85); // push down near ceiling

  // Update log-price: toward anchor + noise (~30%)
  logP += K * (logAnchor - logP) + wallPush + gaussian() * SIGMA;

  // Soft reflection: don’t glue to the hard bounds
  if (logP < logMin) logP = logMin + (logMin - logP) * 0.33;
  if (logP > logMax) logP = logMax - (logP - logMax) * 0.33;

  price = Math.exp(logP);

  // record + redraw
  priceHistory.push(price);
  if (priceHistory.length > 60) priceHistory.shift();
  updateDisplay();
  drawGraph();
}

    function buyCookie(amount = 1) {
      if (amount <= 0) return;
      const cost = price * amount;
      if (balance >= cost) {
        balance -= cost;
        cookies += amount;
        wallet.push({ amount, priceAtPurchase: price, total: cost });
        renderWallet();
        updateDisplay();
      }
    }

    function sellCookie(amount = 1) {
      if (amount <= 0) return;
      if (cookies >= amount) {
        let toSell = amount;
        let i = 0;
        while (toSell > 0 && i < wallet.length) {
          const entry = wallet[i];
          if (entry.amount <= toSell) {
            balance += entry.amount * price;
            toSell -= entry.amount;
            wallet.splice(i, 1);
          } else {
            balance += toSell * price;
            entry.amount -= toSell;
            entry.total = entry.amount * entry.priceAtPurchase;
            toSell = 0;
            i++;
          }
        }
        cookies -= amount;
        if (cookies < 0) cookies = 0;
        updateDisplay();
        renderWallet();
      }
    }

    function drawGraph() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const maxPrice = Math.max(...priceHistory);
      const minPrice = Math.min(...priceHistory);
      const range = (maxPrice - minPrice) || 1; // avoid divide-by-zero

      ctx.beginPath();
      for (let i = 0; i < priceHistory.length; i++) {
        const x = (i / (priceHistory.length - 1)) * canvas.width;
        const y = canvas.height - ((priceHistory[i] - minPrice) / range) * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#ff9900";
      ctx.lineWidth = 2;
      ctx.stroke();

      // last point
      const lastX = canvas.width;
      const lastY = canvas.height - ((price - minPrice) / range) * canvas.height;
      ctx.fillStyle = "#cc6600";
      ctx.beginPath();
      ctx.arc(lastX - 2, lastY, 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    function renderWallet() {
      walletBody.innerHTML = "";
      wallet.forEach((entry, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${index + 1}</td>
          <td>${entry.amount}</td>
          <td>$${entry.priceAtPurchase.toFixed(2)}</td>
          <td>$${entry.total.toFixed(2)}</td>
        `;
        walletBody.appendChild(row);
      });
    }

    // -------- Selector-powered actions ----------
    function getSelectedAmount() {
      const v = qtySelect.value;
      if (v === "max") return "max";
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : 1;
    }

    function updateActionState(){
      const sel = getSelectedAmount();
      const maxAffordable = Math.floor(balance / price);

      // Update button labels
      buyBtn.textContent  = `Buy ${sel === "max" ? "Max" : sel + "×"}`;
      sellBtn.textContent = `Sell ${sel === "max" ? "All" : sel + "×"}`;

      // Enable/disable based on feasibility
      const buyDisabled  = sel === "max" ? (maxAffordable === 0) : (balance < price * sel);
      const sellDisabled = sel === "max" ? (cookies <= 0)        : (cookies < sel);

      buyBtn.disabled  = buyDisabled;
      sellBtn.disabled = sellDisabled;
    }

    function buySelected() {
      const sel = getSelectedAmount();
      if (sel === "max") {
        const maxAffordable = Math.floor(balance / price);
        if (maxAffordable > 0) buyCookie(maxAffordable);
        return;
      }
      buyCookie(sel);
    }

    function sellSelected() {
      const sel = getSelectedAmount();
      if (sel === "max") {
        sellCookie(cookies);
        return;
      }
      const amt = Math.min(sel, cookies);
      if (amt > 0) sellCookie(amt);
    }

    qtySelect.addEventListener("change", updateActionState);
    // -------------------------------------------

    setInterval(fluctuatePrice, 1500);
    updateDisplay();
    drawGraph();
