let songs = [];
let filteredSongs = [];
let playlists = ["Default", "Workout", "Chill", "Party", "Late Night"];
let currentPlaylist = "Default";
let currentIndex = 0;
let isPlaying = false;
let isShuffle = false;
let isLoop = false;
let currentTab = 'playlist';
let db;

let audioCtx, analyser, masterGain, sourceConnected = false;
let eqFilters = {};
let parsedLyrics = [];

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => console.log("Mann Sutra PWA Active"));
}

const request = indexedDB.open("MannSutraDB", 5);

request.onupgradeneeded = function(event) {
    db = event.target.result;
    if (!db.objectStoreNames.contains("songs")) {
        db.createObjectStore("songs", { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains("playlists")) {
        let pStore = db.createObjectStore("playlists", { keyPath: "name" });
        playlists.forEach(p => pStore.put({ name: p }));
    }
};

request.onsuccess = function(event) {
    db = event.target.result;
    loadPlaylistsFromDB();
};

const songListContainer = document.getElementById("songList");
const audioPlayer = document.getElementById("audioPlayer");
const currentTitle = document.getElementById("currentTitle");
const currentArtist = document.getElementById("currentArtist");
const currentImg = document.getElementById("currentImg");
const playBtn = document.getElementById("playBtn");
const progressBar = document.getElementById("progressBar");
const currentTimeEl = document.getElementById("currentTime");
const durationTimeEl = document.getElementById("durationTime");
const volumeSlider = document.getElementById("volumeSlider");
const searchContainer = document.getElementById("searchContainer");
const shuffleBtn = document.getElementById("shuffleBtn");
const loopBtn = document.getElementById("loopBtn");
const lyricsModal = document.getElementById("lyricsModal");
const lyricsText = document.getElementById("lyricsText");
const settingsModal = document.getElementById("settingsModal");
const currentLikeBtn = document.getElementById("currentLikeBtn");

window.onload = () => {
    let savedTheme = localStorage.getItem("spotify_theme");
    if (savedTheme) setTheme(savedTheme, false);
};

function setTheme(color, save = true) {
    document.documentElement.style.setProperty('--accent-color', color);
    if (save) localStorage.setItem("spotify_theme", color);
}

function loadPlaylistsFromDB() {
    let transaction = db.transaction(["playlists"], "readonly");
    let store = transaction.objectStore("playlists");
    let req = store.getAll();
    req.onsuccess = function(e) {
        if (e.target.result && e.target.result.length > 0) {
            playlists = e.target.result.map(p => p.name);
        }
        loadSongsFromDB();
    };
}

function handleFiles(event) {
    const files = event.target.files;
    if (!files.length) return;

    let transaction = db.transaction(["songs"], "readwrite");
    let store = transaction.objectStore("songs");

    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        let fullName = file.name.replace(/\.[^/.]+$/, "");
        
        let songData = {
            title: fullName,
            artist: "Local Device",
            img: "logo.png",
            lyrics: "",
            isLiked: false,
            playlist: currentPlaylist,
            playCount: 0,
            fileBlob: file
        };

        let req = store.add(songData);
        req.onsuccess = function(e) {
            songData.id = e.target.result;
            songData.src = URL.createObjectURL(file);
            songs.push(songData);
            if (currentTab === 'playlist') renderPlaylist();

            if (!isPlaying && songs.length === 1 && currentTab === 'playlist') {
                currentIndex = 0;
                playSong(currentIndex);
            }
        };
    }
}

function loadSongsFromDB() {
    let transaction = db.transaction(["songs"], "readonly");
    let store = transaction.objectStore("songs");
    let req = store.getAll();

    req.onsuccess = function(event) {
        let savedSongs = event.target.result;
        songs = savedSongs.map(s => ({
            id: s.id,
            title: s.title,
            artist: s.artist || "Mann Sutra",
            img: s.img || "logo.png",
            lyrics: s.lyrics || "",
            isLiked: s.isLiked || false,
            playlist: s.playlist || "Default",
            playCount: s.playCount || 0,
            src: URL.createObjectURL(s.fileBlob),
            fileBlob: s.fileBlob
        }));
        renderPlaylist();
    };
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById("navPlaylist").classList.toggle("active", tab === 'playlist');
    document.getElementById("navLiked").classList.toggle("active", tab === 'liked');
    document.getElementById("navWeb").classList.toggle("active", tab === 'web');

    if (tab === 'playlist') {
        renderPlaylistUI();
    } else if (tab === 'liked') {
        document.getElementById("headerTitle").innerText = "Liked Songs";
        searchContainer.innerHTML = `<input type="text" id="searchInput" placeholder="Search liked songs..." oninput="filterSongs()">`;
        renderPlaylist();
    } else if (tab === 'web') {
        document.getElementById("headerTitle").innerText = "Search & Download Song";
        searchContainer.innerHTML = ``;
        renderWebDownloadUI();
    }
}

function renderPlaylistUI() {
    let playlistTabsHTML = playlists.map(p => `
        <button onclick="switchPlaylist('${p}')" style="padding:6px 14px; border-radius:15px; border:none; background:${currentPlaylist === p ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}; color:white; font-size:12px; cursor:pointer; font-weight:bold;">${p}</button>
    `).join('');

    document.getElementById("headerTitle").innerText = `Playlist: ${currentPlaylist}`;
    searchContainer.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:4px;">${playlistTabsHTML}</div>
            <div style="display:flex; gap:8px;">
                <input type="text" id="searchInput" placeholder="Search in ${currentPlaylist}..." oninput="filterSongs()" style="flex-grow:1; padding:8px 12px; border-radius:18px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:white; outline:none; font-size:13px;">
                <button onclick="createNewPlaylistPrompt()" style="background:rgba(255,255,255,0.15); border:none; color:white; padding:0 12px; border-radius:18px; font-size:12px; cursor:pointer;">+ New List</button>
            </div>
        </div>
    `;
    renderPlaylist();
}

function renderWebDownloadUI() {
    songListContainer.innerHTML = `
        <div style="padding:15px; color:#ddd; font-size:13px; line-height:1.6;">
            <h3 style="color:var(--accent-color);">🔍 Search Song List (15 Results)</h3>
            <div style="display:flex; gap:8px; margin-top:12px;">
                <input type="text" id="songQueryInput" placeholder="Type song name (e.g. Naina)..." style="flex-grow:1; padding:12px 16px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:white; outline:none; font-size:13px;">
                <button onclick="searchSongsOnWeb()" style="background:var(--accent-color); border:none; color:white; padding:0 18px; border-radius:20px; font-weight:bold; cursor:pointer;">Search</button>
            </div>
            <div id="searchResultsList" style="margin-top:15px; display:flex; flex-direction:column; gap:10px;"></div>
        </div>
    `;
}

async function searchSongsOnWeb() {
    let query = document.getElementById("songQueryInput").value.trim();
    let resultsContainer = document.getElementById("searchResultsList");
    if (!query) return alert("Please enter a song name to search.");

    resultsContainer.innerHTML = `<p style="text-align:center; color:#aaa;">Searching songs...</p>`;

    try {
        // UPDATE THIS URL WHEN HOSTED LIVE
        let res = await fetch('http://127.0.0.1:5000/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        let data = await res.json();

        if (!data.results || data.results.length === 0) {
            resultsContainer.innerHTML = `<p style="text-align:center; color:#aaa;">No songs found.</p>`;
            return;
        }

        resultsContainer.innerHTML = data.results.map((song) => `
            <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.05); padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:45%; font-size:13px;">${song.title}</span>
                <div style="display:flex; gap:6px;">
                    <button onclick="previewSongFromWeb('${encodeURIComponent(song.url)}', '${encodeURIComponent(song.title)}')" style="background:rgba(255,255,255,0.15); border:none; color:white; padding:6px 10px; border-radius:10px; font-size:12px; cursor:pointer;">▶ Play</button>
                    <button onclick="downloadChosenSong('${encodeURIComponent(song.url)}', '${encodeURIComponent(song.title)}')" style="background:var(--accent-color); border:none; color:white; padding:6px 10px; border-radius:10px; font-size:12px; cursor:pointer; font-weight:bold;">Download</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        resultsContainer.innerHTML = `<p style="text-align:center; color:#ff4d4d;">Search failed. Check your local Flask server.</p>`;
    }
}

async function previewSongFromWeb(encodedUrl, encodedTitle) {
    let url = decodeURIComponent(encodedUrl);
    let title = decodeURIComponent(encodedTitle);
    
    alert(`Loading preview for "${title}"... Please wait.`);

    try {
        // UPDATE THIS URL WHEN HOSTED LIVE
        let response = await fetch('http://127.0.0.1:5000/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });
        
        let data = await response.json();
        
        if (data.direct_url) {
            audioPlayer.src = data.direct_url;
            audioPlayer.play();
            isPlaying = true;
            playBtn.innerText = "⏸";
            currentTitle.innerText = title;
            currentArtist.innerText = "Preview (Not Saved)";
            currentImg.src = "logo.png";
        } else {
            throw new Error("Could not extract stream URL");
        }
    } catch (err) {
        alert("Could not load preview.");
        console.error(err);
    }
}

async function downloadChosenSong(encodedUrl, encodedTitle) {
    let url = decodeURIComponent(encodedUrl);
    let title = decodeURIComponent(encodedTitle);

    alert(`Starting download for "${title}"... Check your notification panel for progress.`);

    try {
        // UPDATE THIS URL WHEN HOSTED LIVE
        let response = await fetch('http://127.0.0.1:5000/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });
        
        let data = await response.json();
        
        if (data.direct_url) {
            // Check kar rahe hain ki app Android APK se khula hai ya nahi
            if (typeof AndroidApp !== "undefined") {
                // Native android downloader ko bhej rahe hain
                AndroidApp.downloadSongNative(data.direct_url, title);
            } else {
                // Agar PC ya normal browser mein hai to new tab mein download shuru hoga
                window.open(data.direct_url, '_blank');
            }
        } else {
            throw new Error("Could not extract direct URL");
        }
    } catch (err) {
        alert("Error initiating the download. Make sure your backend server is running.");
        console.error(err);
    }
}

function switchPlaylist(pName) {
    currentPlaylist = pName;
    renderPlaylistUI();
}

function createNewPlaylistPrompt() {
    let name = prompt("Enter new playlist name:");
    if (name && !playlists.includes(name)) {
        playlists.push(name);
        let transaction = db.transaction(["playlists"], "readwrite");
        transaction.objectStore("playlists").put({ name: name });
        switchPlaylist(name);
    }
}

function filterSongs() {
    renderPlaylist();
}

function renderPlaylist() {
    if (currentTab === 'web') return;
    const query = document.getElementById("searchInput") ? document.getElementById("searchInput").value.toLowerCase() : "";
    let baseList = currentTab === 'liked' ? songs.filter(s => s.isLiked) : songs.filter(s => s.playlist === currentPlaylist);
    filteredSongs = baseList.filter(song => song.title.toLowerCase().includes(query));

    songListContainer.innerHTML = "";
    if (filteredSongs.length === 0) {
        songListContainer.innerHTML = `<p style="color: #888; text-align: center; margin-top: 40px;">No songs found. Tap '+ Upload' or 'Web URL' to add songs.</p>`;
        return;
    }

    filteredSongs.forEach((song) => {
        let originalIndex = songs.indexOf(song);
        let item = document.createElement("div");
        item.className = "song-item";
        item.innerHTML = `
            <div class="song-left" onclick="playSong(${originalIndex})">
                <img src="${song.img}" onerror="this.src='logo.png'" alt="cover">
                <div class="song-info">
                    <h4>${song.title}</h4>
                    <p>${song.artist} • 🎧 ${song.playCount} plays</p>
                </div>
            </div>
            <div class="song-actions">
                <button class="btn-like ${song.isLiked ? 'liked' : ''}" onclick="toggleLike(${originalIndex})">❤️</button>
                <button onclick="openEditor(${originalIndex})" style="background:none;border:none;cursor:pointer;font-size:14px;" title="Edit Metadata">✏️</button>
                <button class="btn-delete" onclick="deleteSong(${originalIndex})">❌</button>
            </div>
        `;
        songListContainer.appendChild(item);
    });
}

async function fetchAndParseLyrics(song) {
    if (song.lyrics && song.lyrics.includes("[")) return parseLrc(song.lyrics);
    try {
        let cleanTitle = song.title.replace(/\([^)]*\)/g, '').trim();
        let res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`);
        let data = await res.json();
        if (data && data.length > 0) {
            let matched = data.find(item => item.syncedLyrics) || data[0];
            let fetched = matched.syncedLyrics || matched.plainLyrics || "No lyrics found.";
            song.lyrics = fetched;
            updateSongInDB(song);
            return parseLrc(fetched);
        }
    } catch(e) {}
    return [{ time: 0, text: song.lyrics || "No lyrics available." }];
}

function parseLrc(lrcText) {
    let lines = lrcText.split("\n");
    let result = [];
    let timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    for (let line of lines) {
        let match = timeRegex.exec(line);
        if (match) {
            let mins = parseInt(match[1]);
            let secs = parseInt(match[2]);
            let millis = parseInt(match[3]) / (match[3].length === 3 ? 1000 : 100);
            let time = mins * 60 + secs + millis;
            let text = line.replace(timeRegex, "").trim();
            if (text) result.push({ time, text });
        }
    }
    if (result.length === 0) return [{ time: 0, text: lrcText }];
    return result;
}

function updateSyncedLyricsDisplay(currentTime) {
    if (!parsedLyrics.length) return;
    let activeIndex = 0;
    for (let i = 0; i < parsedLyrics.length; i++) {
        if (currentTime >= parsedLyrics[i].time) activeIndex = i;
    }
    lyricsText.innerHTML = parsedLyrics.map((l, idx) => `
        <div style="padding:8px 0; transition:0.3s; color:${idx === activeIndex ? 'var(--accent-color)' : '#aaa'}; font-weight:${idx === activeIndex ? 'bold' : 'normal'}; font-size:${idx === activeIndex ? '16px' : '14px'};">${l.text}</div>
    `).join('');
}

async function playSong(index) {
    if (songs.length === 0) return;
    currentIndex = index;
    let song = songs[currentIndex];
    
    song.playCount = (song.playCount || 0) + 1;
    updateSongInDB(song);

    audioPlayer.src = song.src;
    audioPlayer.play();
    isPlaying = true;
    
    currentTitle.innerText = song.title;
    currentArtist.innerText = song.artist;
    currentImg.src = song.img;
    playBtn.innerText = "⏸";
    
    lyricsText.innerText = "Loading synced lyrics...";
    parsedLyrics = await fetchAndParseLyrics(song);
    updateLikeButtonUI();
    initAudioPipeline();
    updateMediaSession(song);
}

function initAudioPipeline() {
    if (sourceConnected) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(1, audioCtx.currentTime);

        let frequencies = [60, 230, 910, 3000, 14000];
        let prevNode = audioCtx.createMediaElementSource(audioPlayer);

        frequencies.forEach((freq, idx) => {
            let filter = audioCtx.createBiquadFilter();
            filter.type = idx === 0 ? "lowshelf" : (idx === frequencies.length - 1 ? "highshelf" : "peaking");
            filter.frequency.setValueAtTime(freq, audioCtx.currentTime);
            filter.gain.setValueAtTime(0, audioCtx.currentTime);
            eqFilters[freq] = filter;
            prevNode.connect(filter);
            prevNode = filter;
        });

        prevNode.connect(masterGain);
        masterGain.connect(analyser);
        analyser.connect(audioCtx.destination);
        analyser.fftSize = 64;
        sourceConnected = true;
        drawVisualizer();
    } catch(e) {}
}

const canvas = document.getElementById("visualizer");
const canvasCtx = canvas.getContext("2d");
function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    if (!analyser) return;
    let bufferLength = analyser.frequencyBinCount;
    let dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    let barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;
    for(let i = 0; i < bufferLength; i++) {
        let barHeight = dataArray[i] / 3;
        canvasCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#ff2a85';
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}

function openEditor(index) {
    let s = songs[index];
    let newTitle = prompt("Edit Song Title:", s.title);
    if (newTitle === null) return;
    let newArtist = prompt("Edit Artist Name:", s.artist);
    let newImg = prompt("Edit Cover Art Image URL:", s.img);
    let targetList = prompt(`Move to playlist (${playlists.join(', ')}):`, s.playlist);

    if (newTitle) s.title = newTitle;
    if (newArtist) s.artist = newArtist;
    if (newImg) s.img = newImg;
    if (targetList && playlists.includes(targetList)) s.playlist = targetList;

    updateSongInDB(s);
    renderPlaylist();
    if (currentIndex === index) {
        currentTitle.innerText = s.title;
        currentArtist.innerText = s.artist;
        currentImg.src = s.img;
    }
}

function updateMediaSession(song) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: currentPlaylist,
            artwork: [{ src: song.img, sizes: '96x96', type: 'image/png' }]
        });
        navigator.mediaSession.setActionHandler('play', () => togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => prevSong());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextSong());
    }
}

function toggleLike(index) {
    songs[index].isLiked = !songs[index].isLiked;
    updateSongInDB(songs[index]);
    renderPlaylist();
    if (currentIndex === index) updateLikeButtonUI();
}

function toggleLikeCurrent() {
    if (songs.length > 0) toggleLike(currentIndex);
}

function updateLikeButtonUI() {
    if (songs[currentIndex] && songs[currentIndex].isLiked) {
        currentLikeBtn.innerText = "❤️";
        currentLikeBtn.classList.add("liked");
    } else {
        currentLikeBtn.innerText = "🤍";
        currentLikeBtn.classList.remove("liked");
    }
}

function updateSongInDB(song) {
    let transaction = db.transaction(["songs"], "readwrite");
    transaction.objectStore("songs").put(song);
}

function togglePlay() {
    if (isPlaying) {
        audioPlayer.pause();
        isPlaying = false;
        playBtn.innerText = "▶";
    } else {
        if (songs.length > 0) {
            if (!audioPlayer.src) playSong(0);
            else {
                audioPlayer.play();
                isPlaying = true;
                playBtn.innerText = "⏸";
                if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
            }
        }
    }
}

function nextSong() {
    if (songs.length === 0) return;
    if (isLoop) {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
        return;
    }
    currentIndex = isShuffle ? Math.floor(Math.random() * songs.length) : (currentIndex + 1) % songs.length;
    playSong(currentIndex);
}

function prevSong() {
    if (songs.length === 0) return;
    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
    } else {
        currentIndex = (currentIndex - 1 + songs.length) % songs.length;
        playSong(currentIndex);
    }
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle("active", isShuffle);
}

function toggleLoop() {
    isLoop = !isLoop;
    loopBtn.classList.toggle("active", isLoop);
    audioPlayer.loop = isLoop;
}

audioPlayer.ontimeupdate = () => {
    if (audioPlayer.duration) {
        progressBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        currentTimeEl.innerText = formatTime(audioPlayer.currentTime);
        durationTimeEl.innerText = formatTime(audioPlayer.duration);
        updateSyncedLyricsDisplay(audioPlayer.currentTime);
    }
};

function seekAudio() {
    if (audioPlayer.duration) {
        audioPlayer.currentTime = (progressBar.value / 100) * audioPlayer.duration;
    }
}

function formatTime(seconds) {
    let mins = Math.floor(seconds / 60);
    let secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function changeVolume() {
    audioPlayer.volume = volumeSlider.value;
}

function toggleLyrics() {
    lyricsModal.style.display = lyricsModal.style.display === "none" ? "flex" : "none";
}

function openSettings() {
    let action = prompt("Type 'export' for Playlist Backup JSON:");
    if (action === 'export') exportPlaylistJSON();
}

function exportPlaylistJSON() {
    let backupData = songs.map(s => ({ title: s.title, artist: s.artist, playlist: s.playlist, isLiked: s.isLiked }));
    let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
    let dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", "playlist_backup.json");
    dl.click();
    dl.remove();
}

function deleteSong(index) {
    let song = songs[index];
    if (song.id) {
        db.transaction(["songs"], "readwrite").objectStore("songs").delete(song.id);
    }
    songs.splice(index, 1);
    if (songs.length === 0) {
        audioPlayer.pause();
        audioPlayer.src = "";
        isPlaying = false;
        currentTitle.innerText = "Select a song";
        playBtn.innerText = "▶";
    } else if (currentIndex >= songs.length) {
        currentIndex = songs.length - 1;
    }
    renderPlaylist();
}

audioPlayer.onended = () => {
    if (!isLoop) nextSong();
};
