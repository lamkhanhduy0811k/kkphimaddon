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
  id: 'org.kkphim.addon',
  version: '1.0.5',
  name: 'KKPhim Addon',
  description: 'Kho phim thuần KKPhim cho Stremio/Nuvio',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'kk_phimle',
      name: 'KKPhim - Phim Lẻ',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'kk_phimbo',
      name: 'KKPhim - Phim Bộ',
      extra: [{ name: 'skip', isRequired: false }]
    }
  ],
  idPrefixes: ['kk:']
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://kkphim.com/'
};

app.get('/', (req, res) => res.send('KKPhim Server Active'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { id } = req.params;
  const isMovie = id === 'kk_phimle';
  const category = isMovie ? 'phim-le' : 'phim-bo';
  const url = `https://kkphim.com/api/v1/danh-sach/${category}`;

  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const items = data?.data?.items || [];
    const cdnDomain = data?.data?.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';

    const metas = items.map(item => {
      let poster = item.poster_url || item.thumb_url || '';
      if (poster && !poster.startsWith('http')) poster = `${cdnDomain}/${poster}`;

      let background = item.thumb_url || item.poster_url || '';
      if (background && !background.startsWith('http')) background = `${cdnDomain}/${background}`;

      return {
        id: `kk:${item.slug}`,
        type: isMovie ? 'movie' : 'series',
        name: item.name || 'Phim KKPhim',
        poster: poster,
        background: background,
        description: item.origin_name || '',
        releaseInfo: String(item.year || '2026')
      };
    });

    return res.json({ metas });
  } catch (e) {
    return res.json({ metas: [] });
  }
});

app.get(['/meta/:type/:id.json', '/meta/:type/:id/:extra.json'], async (req, res) => {
  const { id, type } = req.params;
  if (!id.startsWith('kk:')) return res.json({ meta: null });

  const slug = id.replace('kk:', '');
  const url = `https://kkphim.com/api/v1/phim/${slug}`;

  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const movie = data?.data?.item;
    if (!movie) return res.json({ meta: null });

    const epData = movie.episodes?.[0]?.server_data || [];
    const cdnDomain = 'https://phimimg.com';
    let poster = movie.poster_url || '';
    if (poster && !poster.startsWith('http')) poster = `${cdnDomain}/${poster}`;

    const videos = epData.map((ep, idx) => ({
      id: `kk:${slug}:${ep.slug}`,
      title: ep.name || `Tập ${idx + 1}`,
      season: 1,
      episode: idx + 1
    }));

    return res.json({
      meta: {
        id: `kk:${slug}`,
        type,
        name: movie.name || 'Phim',
        poster: poster,
        description: movie.content || '',
        genres: movie.category?.map(c => c.name) || [],
        videos
      }
    });
  } catch (e) {
    return res.json({ meta: null });
  }
});

app.get(['/stream/:type/:id.json', '/stream/:type/:id/:extra.json'], async (req, res) => {
  const { id } = req.params;
  if (!id.startsWith('kk:')) return res.json({ streams: [] });

  const parts = id.split(':');
  const slug = parts[1];
  const epSlug = parts[2];

  const url = `https://kkphim.com/api/v1/phim/${slug}`;

  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const servers = data?.data?.item?.episodes || [];
    let streams = [];

    servers.forEach(srv => {
      const ep = srv.server_data?.find(e => e.slug === epSlug) || srv.server_data?.[0];
      if (ep && ep.link_m3u8) {
        streams.push({
          name: `KKPhim [${srv.server_name || 'VIP'}]`,
          title: ep.name || 'FHD',
          url: ep.link_m3u8
        });
      }
    });

    return res.json({ streams });
  } catch (e) {
    return res.json({ streams: [] });
  }
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`KKPhim Addon running on port ${PORT}`));
