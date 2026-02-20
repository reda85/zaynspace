
export const generatePinsJS = (pins) => {
  if (pins.length === 0) return '';
  
  const pinsJS = pins.map((pin, index) => `
    var pin${index} = document.createElement('div');
    pin${index}.style.position = 'absolute';
    pin${index}.style.left = '${pin.x - 10}px';
    pin${index}.style.top = '${pin.y - 10}px';
    pin${index}.style.width = '20px';
    pin${index}.style.height = '20px';
    pin${index}.style.borderRadius = '10px';
    pin${index}.style.backgroundColor = ${pin.photoUri ? "'green'" : "'red'"};
    pin${index}.style.zIndex = '1000';
    pin${index}.title = '${pin.note.replace(/'/g, "\\'")}';
    
   
    pin${index}.onclick = function(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'showPinDetails',
        index: ${index}
      }));
      e.stopPropagation();
    };
    
    document.body.appendChild(pin${index});
  `).join('');
  
  return `
    (function() {
      ${pinsJS}
    })();
    true;
  `;
};


export const generatePinModeJS = (active) => {
  return active 
    ? `document.removeEventListener('click', window.pinClickHandler); true;` 
    : `
      window.pinClickHandler = function(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'pinPosition',
          x: e.pageX,
          y: e.pageY
        }));
        e.preventDefault();
        e.stopPropagation();
        return false;
      };
      
      document.addEventListener('click', window.pinClickHandler, true);
      true;
    `;
};