const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const MANIFEST = {
  id: 'org.multisource.addon',
  version: '2.2.0',
  name: 'Tổng Hợp Phim Vietsub',
  description: 'Addon tổng hợp kho phim từ NguồnC, KKPhim và Ổ Phim cho Stremio/Nuvio',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'nc_phimle', name: 'Nguồn C - Phim Lẻ', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'nc_phimbo', name: 'Nguồn C - Phim Bộ', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'movie', id: 'kk_phimle', name: 'KKPhim - Phim Lẻ', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'kk_phimbo', name: 'KKPhim - Phim Bộ', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'movie', id: 'op_phimle', name: 'Ổ Phim - Phim Lẻ', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'op_phimbo', name: 'Ổ Phim - Phim Bộ', extra: [{ name: 'skip', isRequired: false }] }
  ],
  idPrefixes: ['nc:', 'kk:', 'op:']
};

app.get('/', (req, res) => res.send('Multi-Source Film Addon Active'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

const HEADERS_NC = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://phim.nguonc.com/'
};

const AXIOS_OPT = {
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
  }
};

function getOphimImage(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const clean = path.replace(/^\/+/, '');
  if (clean.startsWith('uploads/')) return `https://img.ophim.live/${clean}`;
  return `https://img.ophim.live/uploads/movies/${clean}`;
}

app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { id } = req.params;
  let metas = [];

  try {
    if (id.startsWith('nc_')) {
      const isMovie = id === 'nc_phimle';
      const cat = isMovie ? 'phim-le' : 'phim-bo';
      
      const testUrls = [
        `https://phim.nguonc.com/api/films/danh-sach/${cat}?page=1`,
        `https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=1`,
        `https://api.nguonc.com/api/films/danh-sach/${cat}?page=1`
      ];

      let items = [];
      for (const u of testUrls) {
        try {
          const resAxios = await axios.get(u, { timeout: 6000, headers: HEADERS_NC, validateStatus: () => true });
          if (resAxios.data?.items && resAxios.data.items.length > 0) {
            items = resAxios.data.items;
            break;
          }
        } catch (e) {}
      }

      metas = items.map(item => ({
        id: `nc:${item.slug}`,
        type: isMovie ? 'movie' : 'series',
        name: item.name || 'Phim Nguồn C',
        poster: item.poster_url || item.thumb_url || '',
        background: item.thumb_url || item.poster_url || '',
        description: item.origin_name || '',
        releaseInfo: String(item.year || '2026')
      }));

    } else if (id.startsWith('kk_')) {
      const isMovie = id === 'kk_phimle';
      const cat = isMovie ? 'phim-le' : 'phim-bo';
      const url = `https://phimapi.com/v1/api/danh-sach/${cat}?page=1`;
      const { data } = await axios.get(url, AXIOS_OPT);
      const items = data?.data?.items || data?.items || [];
      const cdn = data?.data?.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';

      metas = items.map(item => ({
        id: `kk:${item.slug}`,
        type: isMovie ? 'movie' : 'series',
        name: item.name || 'Phim KKPhim',
        poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`,
        background: item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`,
        description: item.origin_name || '',
        releaseInfo: String(item.year || '2026')
      }));

    } else if (id.startsWith('op_')) {
      const isMovie = id === 'op_phimle';
      const cat = isMovie ? 'phim-le' : 'phim-bo';
      const url = `https://ophim1.com/v1/api/danh-sach/${cat}?page=1`;
      const { data } = await axios.get(url, AXIOS_OPT);
      const items = data?.data?.items || data?.items || [];

      metas = items.map(item => ({
        id: `op:${item.slug}`,
        type: isMovie ? 'movie' : 'series',
        name: item.name || 'Phim Ổ Phim',
        poster: getOphimImage(item.poster_url || item.thumb_url),
        background: getOphimImage(item.thumb_url || item.poster_url),
        description: item.origin_name || '',
        releaseInfo: String(item.year || '2026')
      }));
    }
  } catch (e) {
    metas = [];
  }

  return res.json({ metas });
});

app.get(['/meta/:type/:id.json', '/meta/:type/:id/:extra.json'], async (req, res) => {
  const { id, type } = req.params;
  const parts = id.split(':');
  const prefix = parts[0];
  const slug = parts[1];

  if (!slug) return res.json({ meta: null });

  try {
    if (prefix === 'nc') {
      const testUrls = [
        `https://phim.nguonc.com/api/film/${slug}`,
        `https://api.nguonc.com/api/film/${slug}`
      ];
      let movie = null;
      for (const u of testUrls) {
        try {
          const resAxios = await axios.get(u, { timeout: 6000, headers: HEADERS_NC, validateStatus: () => true });
          if (resAxios.data?.movie) {
            movie = resAxios.data.movie;
            break;
          }
        } catch (e) {}
      }

      if (!movie) return res.json({ meta: null });

      const epData = movie.episodes?.[0]?.items || [];
      const videos = epData.map((ep, idx) => ({
        id: `nc:${slug}:${ep.slug}`,
        title: ep.name || `Tập ${idx + 1}`,
        season: 1,
        episode: idx + 1
      }));

      return res.json({
        meta: {
          id: `nc:${slug}`,
          type,
          name: movie.name || 'Phim',
          poster: movie.poster_url || movie.thumb_url || '',
          description: movie.description || '',
          videos
        }
      });

    } else if (prefix === 'kk' || prefix === 'op') {
      const url = prefix === 'kk' ? `https://phimapi.com/phim/${slug}` : `https://ophim1.com/phim/${slug}`;
      const { data } = await axios.get(url, AXIOS_OPT);
      const movie = data?.movie || data?.data?.item;
      if (!movie) return res.json({ meta: null });

      const epData = data?.episodes?.[0]?.server_data || movie?.episodes?.[0]?.server_data || [];
      const videos = epData.map((ep, idx) => ({
        id: `${prefix}:${slug}:${ep.slug}`,
        title: ep.name || `Tập ${idx + 1}`,
        season: 1,
        episode: idx + 1
      }));

      const poster = prefix === 'op' 
        ? getOphimImage(movie.poster_url || movie.thumb_url)
        : (movie.poster_url?.startsWith('http') ? movie.poster_url : `https://phimimg.com/${movie.poster_url}`);

      return res.json({
        meta: {
          id: `${prefix}:${slug}`,
          type,
          name: movie.name || 'Phim',
          poster: poster,
          description: movie.content || '',
          genres: movie.category?.map(c => c.name) || [],
          videos
        }
      });
    }
  } catch (e) {
    return res.json({ meta: null });
  }
});

app.get(['/stream/:type/:id.json', '/stream/:type/:id/:extra.json'], async (req, res) => {
  const { id } = req.params;
  const parts = id.split(':');
  const prefix = parts[0];
  const slug = parts[1];
  const epSlug = parts[2];

  let streams = [];

  try {
    if (prefix === 'nc') {
      const testUrls = [
        `https://phim.nguonc.com/api/film/${slug}`,
        `https://api.nguonc.com/api/film/${slug}`
      ];
      let movie = null;
      for (const u of testUrls) {
        try {
          const resAxios = await axios.get(u, { timeout: 6000, headers: HEADERS_NC, validateStatus: () => true });
          if (resAxios.data?.movie) {
            movie = resAxios.data.movie;
            break;
          }
        } catch (e) {}
      }

      const servers = movie?.episodes || [];
      servers.forEach(srv => {
        const ep = srv.items?.find(e => e.slug === epSlug) || srv.items?.[0];
        if (ep && (ep.m3u8 || ep.embed)) {
          streams.push({
            name: `[Nguồn C] ${srv.server_name || 'VIP'}`,
            title: ep.name || 'FHD',
            url: ep.m3u8 || ep.embed
          });
        }
      });

    } else if (prefix === 'kk' || prefix === 'op') {
      const url = prefix === 'kk' ? `https://phimapi.com/phim/${slug}` : `https://ophim1.com/phim/${slug}`;
      const { data } = await axios.get(url, AXIOS_OPT);
      const servers = data?.episodes || data?.data?.item?.episodes || [];

      servers.forEach(srv => {
        const ep = srv.server_data?.find(e => e.slug === epSlug) || srv.server_data?.[0];
        if (ep && ep.link_m3u8) {
          streams.push({
            name: `[${prefix.toUpperCase()}] ${srv.server_name || 'VIP'}`,
            title: ep.name || 'FHD',
            url: ep.link_m3u8
          });
        }
      });
    }
  } catch (e) {
    streams = [];
  }

  return res.json({ streams });
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Multi-source Addon running on port ${PORT}`));
            
