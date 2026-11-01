(()=>{
  const DEFAULTS = {enabled: true, strength: 100, type: "custom"};

  const enabledInput = document.getElementById("enabled");
  const strengthInput = document.getElementById("strength");
  const strengthValue = document.getElementById("strength-value");
  const typeInput = document.getElementById("type");
  const status = document.getElementById("status");

  let activeTabId = null;
  let saveTimer = null;

  function setStatus(message, isError=false){
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function currentSettings(){
    return {
      enabled: enabledInput.checked,
      strength: Number(strengthInput.value),
      type: typeInput.value
    };
  }

  function injectAndSend(settings){
    if(activeTabId === null) return;

    const message = {
      type: "color-vision-mapper:set-settings",
      settings
    };

    chrome.tabs.sendMessage(activeTabId, message, ()=>{
      if(!chrome.runtime.lastError){
        setStatus(settings.enabled && settings.strength > 0 ? "Transformation is active on this page." : "Transformation is off.");
        return;
      }

      chrome.scripting.executeScript(
        {target: {tabId: activeTabId}, files: ["content.js"]},
        ()=>{
          if(chrome.runtime.lastError){
            setStatus("Chrome does not allow extensions to modify this page.", true);
            return;
          }
          chrome.tabs.sendMessage(activeTabId, message, ()=>{
            if(chrome.runtime.lastError){
              setStatus("Could not apply the transform on this page.", true);
            } else {
              setStatus(settings.enabled && settings.strength > 0 ? "Transformation is active on this page." : "Transformation is off.");
            }
          });
        }
      );
    });
  }

  function persistAndApply(){
    const settings = currentSettings();
    chrome.storage.local.set(settings, ()=> injectAndSend(settings));
  }

  chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs)=>{
    activeTabId = tabs && tabs[0] ? tabs[0].id : null;
    chrome.storage.local.get(DEFAULTS, (settings)=>{
      const merged = { ...DEFAULTS, ...(settings||{}) };
      enabledInput.checked = Boolean(merged.enabled);
      strengthInput.value = String(merged.strength);
      typeInput.value = merged.type || DEFAULTS.type;

      strengthValue.value = `${merged.strength}%`;
      strengthValue.textContent = `${merged.strength}%`;

      injectAndSend(merged);
    });
  });

  enabledInput.addEventListener("change", persistAndApply);
  typeInput.addEventListener("change", persistAndApply);

  strengthInput.addEventListener("input", ()=>{
    strengthValue.value = `${strengthInput.value}%`;
    strengthValue.textContent = `${strengthInput.value}%`;
    injectAndSend(currentSettings());
  });

  strengthInput.addEventListener("change", ()=>{
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistAndApply, 100);
  });
})();
