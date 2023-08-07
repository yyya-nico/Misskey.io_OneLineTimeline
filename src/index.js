import { Stream as misskeyStream } from 'misskey-js';
import { parseSimple as mfmParseSimple } from 'mfm-js';

document.addEventListener('DOMContentLoaded', async () => {
  const currentOrigin = 'https://misskey.io';
  const stream = new misskeyStream(currentOrigin);
  const hTimeline = stream.useChannel('localTimeline');
  const containers = document.querySelectorAll('.container');
  const noteList = document.getElementById('notes-list');
  const renoteList = document.getElementById('renotes-list');
  const notelatestBtn = document.getElementById('note-latest');
  const renotelatestBtn = document.getElementById('renote-latest');
  const autoShowNew = {
    note: true,
    renote: true
  };
  const stored = {
    notes: [],
    renotes: []
  };
  const emojiShortcodeToUrlDic = {};
  const noteLimit = 150;
  let wakeLock = null;

  const scrollToBottom = node => {
    node.scrollTop = node.scrollHeight;
  }

  const htmlspecialchars = unsafeText => {
    if(typeof unsafeText !== 'string'){
      return unsafeText;
    }
    return unsafeText.replace(
      /[&'`"<>]/g, 
      match => {
        return {
          '&': '&amp;',
          "'": '&#x27;',
          '`': '&#x60;',
          '"': '&quot;',
          '<': '&lt;',
          '>': '&gt;',
        }[match]
      }
    );
  }

  const fromNow = posted => {
    const diff = new Date().getTime() - posted.getTime();
    const progress = new Date(diff);

    if (progress.getUTCFullYear() - 1970) {
      return progress.getUTCFullYear() - 1970 + '年前';
    } else if (progress.getUTCMonth()) {
      return progress.getUTCMonth() + 'ヶ月前';
    } else if (progress.getUTCDate() - 1) {
      return progress.getUTCDate() - 1 + '日前';
    } else if (progress.getUTCHours()) {
      return progress.getUTCHours() + '時間前';
    } else if (progress.getUTCMinutes()) {
      return progress.getUTCMinutes() + '分前';
    } else {
      return progress.getUTCSeconds() + '秒前';
    }
  }

  const emojiShortcodeToUrl = async (name, host) => {
    // if (host) {
    //   console.log('external host emoji:', name);
    // }
    if (!(name in emojiShortcodeToUrlDic)) {
      const targetOrigin = host ? `https://${host}` : currentOrigin;
      await fetch(`${targetOrigin}/api/emoji?name=${name}`)
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            // console.log('error');
            emojiShortcodeToUrlDic[name] = null;
          } else {
            emojiShortcodeToUrlDic[name] = data.url;
          }
        }).catch((e) => {
          // console.log('catch');
          emojiShortcodeToUrlDic[name] = null;
        });
    }
    return emojiShortcodeToUrlDic[name];
  }
  // console.log(emojiShortcodeToUrl('x_z'));

  const simpleMfmToHTML = async (text, host) => {
    if (!text) {
      return '';
    }
    const parsedMfm = mfmParseSimple(text);
    let html = '';
    for (const node of parsedMfm) {
      switch(node.type) {
        case 'emojiCode':
          const emojiUrl = await emojiShortcodeToUrl(node.props.name, host);
            if (emojiUrl === null) {
              html += `:${node.props.name}:`
            } else {
              html += `<img class="custom-emoji" src="${emojiUrl}" alt=":${node.props.name}:" title=":${node.props.name}:">`;
            }
          break;
        case 'text':
          html += node.props.text;
          break;
        case 'unicodeEmoji':
          html += node.props.emoji;
          break;
      }
    }
    return html;
  }
  // console.log(simpleMfmToHTML(''));
  // console.log(simpleMfmToHTML(null));
  // console.log(simpleMfmToHTML());

  const makeTextHTMLFromNote = async (note, host) => {
    if (note.cw) {
      return `[CW]${await simpleMfmToHTML(htmlspecialchars(note.cw), host)} <span class="cwtext">${(await simpleMfmToHTML(htmlspecialchars(note.text), host)).replace(/\n/g, '<br>')}</span>`;
    } else if (note.text) {
      return (await simpleMfmToHTML(htmlspecialchars(note.text), host)).replace(/\n/g, '<br>');
    } else if (note.renoteId) {
      return '';
    } else {
      return '<span class="nothing">なにもありません</span>';
    }
  }

  const makeHTMLFromNote = async note => {
    note.isRenote = Boolean(note.renoteId);
    const renote = note.isRenote ? note.renote : null;
    renote && (renote.host = renote.user.host);
    // if (renote.host) {
    //   console.log('detected external host renote:', renote.host, 'note id:', note.id);
    // }
    const formatted = {
      name:      note.user.name ? await simpleMfmToHTML(note.user.name) : note.user.username,
      plainName: note.user.name ? note.user.name : note.user.username,
      text:      await makeTextHTMLFromNote(note),
      fileCount: note.fileIds.length ? `<span class="file-count">[${note.fileIds.length}つのファイル]</span>` : '', 
      time:      new Date(note.createdAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}),
      ...(renote && {
        rnName:      renote.user.name ? await simpleMfmToHTML(renote.user.name, renote.host) : renote.user.username,
        plainRnName: renote.user.name ? renote.user.name : renote.user.username,
        rnText:      await makeTextHTMLFromNote(renote, renote.host),
        rnFileCount: renote.fileIds.length ? `<span class="file-count">[${renote.fileIds.length}つのファイル]</span>` : '', 
        rnTime: fromNow(new Date(renote.createdAt))
      })
    };
    const html = !renote ? 
    `<li data-id="${note.id}">
      <span class="wrap"><span class="name" title="${formatted.plainName}">${formatted.name}</span><span class="text">${formatted.text}${formatted.fileCount}</span></span><a href="${currentOrigin}/notes/${note.id}" class="time" target="_blank" rel=”noopener”>${formatted.time}</a>
    </li>
    `
    :
    `<li data-id="${note.id}">
      <div class="renote-info">
        <span class="wrap"><span class="name" title="${formatted.plainName}">${formatted.name}</span><span class="text">${formatted.text}${formatted.fileCount}</span></span><a href="${currentOrigin}/notes/${note.id}" class="time" target="_blank" rel=”noopener”>${formatted.time}</a>
      </div>
      <div class="renoted-note">
        <span class="wrap"><span class="name" title="${formatted.plainRnName}">${formatted.rnName}</span><span class="text">${formatted.rnText}${formatted.rnFileCount}</span></span><a href="${currentOrigin}/notes/${renote.id}" class="time" target="_blank" rel=”noopener”>${formatted.rnTime}</a>
      </div>
    </li>
    `;
    return html;
  };

  Node.prototype.appendToTl = async function(noteOrNotes) {
    if (this !== noteList && this !== renoteList) {
      return false;
    }
    // console.log(note);
    const isNote = !Array.isArray(noteOrNotes);
    let html = '';
    if (isNote) {
      const note = noteOrNotes;
      html = await makeHTMLFromNote(note);
    } else {
      const notes = noteOrNotes;
      while (notes.length) {
        html += await makeHTMLFromNote(notes.shift());
        // console.log('note shifted, notes count:', notes.length);
      }
    }
    this.insertAdjacentHTML('beforeend', html);
    // console.log('note count:',this.querySelectorAll('li').length);
    if (autoShowNew[this === noteList && 'note' || this === renoteList && 'renote']) {
      scrollToBottom(this.parentElement);
    }
    while (this.querySelectorAll('li').length > noteLimit) {
      this.firstElementChild.remove();
    }
  }

  stream.on('_connected_', async () => {
    // console.log('connected');
    wakeLock = await navigator.wakeLock.request('screen');
  });

  stream.on('_disconnected_', () => {
    // console.log('disconnected');
    wakeLock.release()
    .then(() => {
      wakeLock = null;
    });
  });

  document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible' && stream.state == 'connected') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  });

  hTimeline.on('note', async note => {
    // console.log(note);
    const isRenote = Boolean(note.renoteId);
    const kind = !isRenote ? 'note' : 'renote';
      if (autoShowNew[kind]) {
        if (!isRenote) {
          await noteList.appendToTl(note);//RN以外
        }else {
          await renoteList.appendToTl(note);//RN
        }
      } else {
        stored[`${kind}s`].push(note);
        // console.log(kind + ' pushed, stored ' + kind +'s count:',stored[`${kind}s`].length);
        if (stored[`${kind}s`].length > noteLimit) {
          stored[`${kind}s`] = stored[`${kind}s`].slice(-noteLimit);
        }
      }
  });

  const textToggleHandler = e => {
    if (e.target.closest('.wrap')) {
      e.target.closest('.wrap').classList.toggle('is-open');
    }
  }

  noteList.addEventListener('click', textToggleHandler);
  renoteList.addEventListener('click', textToggleHandler);

  const latestBtnHandler = async e => {
    const latestBtn = e.target;
    latestBtn.textContent = '読み込み中...';
    if (latestBtn === notelatestBtn) {
      autoShowNew.note = true;
      await noteList.appendToTl(stored.notes);//RN以外
    } else if (latestBtn === renotelatestBtn) {
      autoShowNew.renote = true;
      await renoteList.appendToTl(stored.renotes);//RN
    }
    latestBtn.textContent = '新しいノートを見る';
  }

  notelatestBtn.addEventListener('click', latestBtnHandler);
  renotelatestBtn.addEventListener('click', latestBtnHandler);

  containers.forEach(container => {
    container.addEventListener('scroll', async e => {
      const latestBtn = container.querySelector('button[id$="-latest"]');
      const containerRole = container.classList.contains('notes')   ? 'notes'
                          : container.classList.contains('renotes') ? 'renotes'
                                                                    : null;
      // console.log('scrolled: '+ containerRole);
      if (container.scrollHeight - container.clientHeight - container.scrollTop >= 3) {
        autoShowNew[containerRole.slice(0,-1)] = false;
        latestBtn.classList.add('show');
      } else {
        if (stored[containerRole].length) {
          if (containerRole === 'notes') {
            await noteList.appendToTl(stored.notes);//RN以外
          } else if (containerRole === 'renotes') {
            await renoteList.appendToTl(stored.renotes);//RN
          }
        } else {
          autoShowNew[containerRole.slice(0,-1)] = true;
          latestBtn.classList.remove('show');
        }
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    const keyName = event.key;

    if (keyName === 'Escape') {
      hTimeline.dispose();
      alert('Escキーが押されたため、タイムラインの受信を停止しました。');
    }
  });
});
