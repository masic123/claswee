// Canvas equivalents of styles/skins.wxss, checked against that file in tests.
const colors = {
  blush: ['#fff8fb','#fff','#513e4b','#927e89','#f1dfe7','#bd4f78','#a8446b','#fff0f6','#2874a2','#2573a8','#eef8ff','#fffdfd','#fffafd', ['#ffe0ea','#fff3f7','#e6f3fc'], ['#ffd5e4','#ff9dbe'], ['#d2efff','#7fc3ec']],
  mint: ['#f2f8f4','#fff','#2b403c','#627a73','#dceae3','#b9533f','#713d34','#fcebe5','#2e8177','#205a53','#e2f4ed','#fafdfb','#f8fcf9', ['#dcf1e7','#f4faf5','#fcece5'], ['#f7d3c5','#ebad99'], ['#c8ebdd','#91d0bd']],
  sun: ['#fff9ed','#fffdf8','#493d2c','#806f56','#ede1c8','#9e651e','#68441c','#fff0cf','#526d98','#344c72','#eaf0fa','#fffcf4','#fffcf5', ['#fce6ad','#fff3d7','#e7eaf5'], ['#f8dfa8','#e6b968'], ['#dce5f3','#a9bcd9']],
  night: ['#0d172b','#17243d','#eef3ff','#acbbd2','#2b3a57','#c29bf8','#f2e8ff','#3b2f58','#6cd5cc','#d7fffa','#24484f','#17243b','#1b2b47', ['#27335a','#1a2b4a','#163d4a'], ['#72539d','#5b457f'], ['#267d80','#1b606d']]
};
const names = ['bg','card','text','muted','line','cat','catInk','catSoft','dog','dogInk','dogSoft','grid','surface','hero','catCourse','dogCourse'];
function get(skin) { const values = colors[skin] || colors.blush; return names.reduce((result, name, index) => { result[name] = values[index]; return result; }, {}); }
export default { get };
