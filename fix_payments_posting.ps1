$ErrorActionPreference = "Stop"

$repo = "C:\Users\HomePC\travel-ledger-pro-v2"
$paymentsPath = Join-Path $repo "frontend\src\pages\Payments.jsx"

if (!(Test-Path $paymentsPath)) { throw "Payments.jsx not found at $paymentsPath" }

$text = [System.IO.File]::ReadAllText($paymentsPath)

$newSubmit = @'
  const submit = async () => {
    setError(""); setMsg("");
    const enteredAmount = parseFloat(amount);
    if (!amount || enteredAmount <= 0) { setError("Amount is required."); return; }
    if (!date) { setError("Date is required."); return; }
    if (!ref || !ref.trim()) { setError("Reference code or tracking number is required."); return; }
    setLoading(true);
    try {
      if (type === "customer") {
        if (!selEntity) { setError("Please select a customer."); setLoading(false); return; }

        if (isAdvance) {
          await axios.post(API + "/cashbook/pay/customer-advance", {
            customer_id: parseInt(selEntity), amount: enteredAmount,
            account, date, description: desc || "Customer Advance", reference: ref
          });
        } else {
          if (invIds.length === 0) {
            setError("Please select an invoice, or tick Advance Payment.");
            setLoading(false);
            return;
          }

          const selectedInvoices = invoices.filter(i => invIds.includes(i.invoice_id));
          const selectedBalance = selectedInvoices.reduce((s, i) => s + (parseFloat(i.balance_due) || 0), 0);
          if (enteredAmount > selectedBalance) {
            setError("Payment amount is more than the selected invoice balance.");
            setLoading(false);
            return;
          }

          let remaining = enteredAmount;
          for (const inv of selectedInvoices) {
            if (remaining <= 0) break;
            const payAmount = Math.min(remaining, parseFloat(inv.balance_due) || 0);
            if (payAmount > 0) {
              await axios.post(API + "/cashbook/pay/customer-invoice", {
                invoice_id: inv.invoice_id, amount: payAmount, account, date, reference: ref
              });
              remaining = Math.round((remaining - payAmount) * 100) / 100;
            }
          }
        }
      } else if (type === "vendor") {
        if (!selEntity) { setError("Please select a vendor."); setLoading(false); return; }

        if (invIds.length === 0) {
          await axios.post(API + "/cashbook/pay/vendor-advance", {
            vendor_id: parseInt(selEntity), amount: enteredAmount, account, date,
            description: desc || "Vendor Payment", reference: ref
          });
        } else {
          const selectedInvoices = invoices.filter(i => invIds.includes(i.invoice_id));
          const selectedBalance = selectedInvoices.reduce((s, i) => s + (parseFloat(i.balance_due) || 0), 0);
          if (enteredAmount > selectedBalance) {
            setError("Payment amount is more than the selected vendor balance.");
            setLoading(false);
            return;
          }

          let remaining = enteredAmount;
          for (const inv of selectedInvoices) {
            if (remaining <= 0) break;
            const payAmount = Math.min(remaining, parseFloat(inv.balance_due) || 0);
            if (payAmount > 0) {
              await axios.post(API + "/cashbook/pay/vendor-advance", {
                vendor_id: parseInt(selEntity), amount: payAmount, account, date,
                description: inv.description || desc || "Vendor Payment", reference: ref,
                booking_id: inv.booking_id || null
              });
              remaining = Math.round((remaining - payAmount) * 100) / 100;
            }
          }
        }
      } else if (type === "expense") {
        if (!expCat) { setError("Please select an expense category."); setLoading(false); return; }
        await axios.post(API + "/cashbook/pay/expense", {
          category: expCat, description: desc, amount: enteredAmount,
          account, date, reference: ref
        });
      } else if (type === "receipt") {
        if (!expCat) { setError("Please select a receipt category."); setLoading(false); return; }
        await axios.post(API + "/cashbook/pay/receipt", {
          category: expCat, description: desc, amount: enteredAmount,
          account, date, reference: ref
        });
      } else if (type === "tax") {
        if (!taxCat) { setError("Please select a tax category."); setLoading(false); return; }
        await axios.post(API + "/cashbook/pay/tax", {
          category: taxCat, description: desc, amount: enteredAmount,
          account, date, reference: ref
        });
      }
      setMsg("Payment recorded successfully.");
      setAmount(""); setRef(""); setDesc(""); setInvIds([]); setBillId(""); setSelEntity("");
      setTimeout(() => loadLedger(), 1000);
    } catch (e) {
      setError(e.response?.data?.error || "Payment failed.");
    }
    setLoading(false);
  };
'@

$pattern = '  const submit = async \(\) => \{[\s\S]*?\n  \};\r?\n\r?\n  // Handle saving the modified row via API and force-refreshing balances'
$replacement = $newSubmit + "`r`n`r`n  // Handle saving the modified row via API and force-refreshing balances"
$updated = [System.Text.RegularExpressions.Regex]::Replace($text, $pattern, $replacement, 1)

if ($updated -eq $text) {
  throw "Could not replace the payment submit function. The file shape may have changed."
}

$updated = $updated -replace "ï»¿", ""
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($paymentsPath, $updated, $utf8NoBom)

Push-Location $repo
try {
  git diff -- frontend/src/pages/Payments.jsx
  Write-Host ""
  Write-Host "Done. Payments posting logic has been repaired." -ForegroundColor Green
  Write-Host "Run: cd frontend; npm run build" -ForegroundColor Yellow
} finally {
  Pop-Location
}
