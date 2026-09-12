// Deliberately UI-only: no data endpoints; fixtures never imported by the automation engine.
const root = document.getElementById('screen');
const scenario = document.cookie.split('; ').find(s => s.startsWith('scenario='))?.split('=')[1] || 'normal';
let member = '', nickname = '', product = 'Checking', intercepted = false;
const balance = () => member === '10002' ? '$8,240.75' : '$2,450.50';
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function view(title, subtitle, body, step='MEMBER SERVICING') {
  root.innerHTML = `<div class="step-badge">${step}</div><h2>${title}</h2><p class="sub">${subtitle}</p>${body}`;
}
function button(name, fn) { [...document.querySelectorAll('button')].find(b => b.textContent === name)?.addEventListener('click', fn); }
function showSearch() {
  view('Member search','Find a member to review their accounts and prepare a servicing request.',
    '<table class="form-table"><tr><td><label for="m">Member number</label><input id="m" inputmode="numeric" autocomplete="off" placeholder="Enter five-digit member number"></td></tr></table><button>Find member</button><p class="note">Demo members: 10001 and 10002. All records are fictional.</p>', '01 / LOOKUP');
  button('Find member', () => {
    member = document.querySelector('input').value;
    if (!/^\d{5}$/.test(member)) return view('Validation error','Enter a five-digit member number.','');
    view('Loading','Retrieving member record…','');
    setTimeout(() => {
      if (scenario === 'hang') return;
      if (scenario === 'app-error') return view('Service unavailable','The servicing system is temporarily unavailable.','');
      if (scenario === 'denied') return view('Permission denied','This operator cannot access the requested record.','');
      if (!['10001','10002'].includes(member)) return view('Member not found','No matching record is available.','');
      view('Search results','One matching member record.',`<div class="card record"><div><span>MEMBER NUMBER</span><strong>${esc(member)}</strong></div><button>Open member</button></div>`, '02 / MATCH');
      button('Open member', () => {
        if (scenario === 'expired' && !intercepted) {
          intercepted = true;
          view('Session expired','Your session expired. Ask the operator to restore access.','<button>Restore session</button>');
          button('Restore session', showDetail);
        } else if (scenario === 'notice' && !intercepted) {
          intercepted = true;
          view('Maintenance notice','A scheduled service notice needs acknowledgement.','<button>Continue session</button>');
          button('Continue session', showDetail);
        } else if (scenario === 'dialog') { window.confirm('Unexpected request'); showDetail(); }
        else showDetail();
      });
    }, scenario === 'slow' ? 800 : 80);
  });
}
function showDetail() {
  view('Member overview',`Member ${esc(member)} · Active relationship`,
    `<div class="card"><span>CURRENT SAVINGS BALANCE</span><strong role="status" aria-label="Savings balance">${balance()}</strong></div><button>Prepare sub-account</button>`, '03 / SERVICE');
  button('Prepare sub-account', () => {
    view('Sub-account draft','Prepare a request for review. Nothing is created at this stage.',
      '<table class="form-table"><tr><td><label for="p">Account product</label><select id="p"><option>Checking</option><option>Savings</option></select></td></tr><tr><td><label for="n">Account nickname</label><input id="n" maxlength="30" autocomplete="off" placeholder="A name for this account"></td></tr></table><button>Review draft</button>', '04 / PREPARE');
    button('Review draft', () => {
      product = document.querySelector('select').value; nickname = document.querySelector('input').value;
      if (!nickname.trim() || scenario === 'validation') return view('Validation error','The draft does not meet account naming requirements.','');
      view('Review ready','Check the request before a human authorizes account creation.',
        `<div class="review-grid"><div class="card"><span>REVIEW STATUS</span><strong class="success" role="status" aria-label="Review status">Ready for approval</strong></div><div class="card"><span>ACCOUNT PRODUCT</span><strong role="status" aria-label="Review product">${esc(product)}</strong></div><div class="card"><span>EXISTING SAVINGS BALANCE</span><strong role="status" aria-label="Savings balance">${balance()}</strong></div><div class="card"><span>NICKNAME</span><strong>${esc(nickname)}</strong></div></div><button class="danger">Create account</button><p class="note">Automation stops here. Creating an account is outside the permitted capability.</p>`, '05 / REVIEW');
      button('Create account', () => view('Account created','Synthetic commit performed. This action is prohibited for automation.',''));
    });
  });
}
showSearch();
