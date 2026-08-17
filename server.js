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
  version: '1.0.0',
  name: 'KKPhim Addon',
  description: 'Kho phim tổng hợp từ KKPhim chất lượng cao cho Stremio/Nuvio.',
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

app.get('/manifest.json', (req, res) => res.json(MANIFEST));

app.get('/catalog/:type/:id.json', async (req, res) => {
  const { id } = req.params;
  let apiUrl = 'https://phimapi.com/danh-sach/phim-moi-cap-nhat'; // Hoặc link API của KKPhim tương ứng
  
  if (id === 'kk_phimle') apiUrl = 'https://kkphim.com/v1/api/danh-sach/phim-le';
  if (id === 'kk_phimbo') apiUrl = 'https://kkphim.com/v1/api/danh-sach/phim-bo';

  try {
    const { data } = await axios.get(apiUrl, { timeout: 4000 });
    const items = data?.data?.items || data?.items || [];
    
    const metas = items.map(item => ({
      id: `kk:${item.slug}`,
      type: id === 'kk_phimle' ? 'movie' : 'series',
      name: item.name,
      poster: item.poster_url?.startsWith('http') ? item.poster_url : `https://img.kkphim.com/${item.poster_url}`,
      background: item.thumb_url?.startsWith('http') ? item.thumb_url : `https://img.kkphim.com/${item.thumb_url}`,
      description: item.origin_name || '',
      releaseInfo: String(item.year || '2026')
    }));

    res.json({ metas });
  } catch (e) {
    res.json({ metas: [] });
  }
});

app.get('/meta/:type/:id.json', async (req, res) => {
  const { id, type } = req.params;
  if (!id.startsWith('kk:')) return res.json({ meta: null });

  const slug = id.replace('kk:', '');
  try {
    const { data } = await axios.get(`https://kkphim.com/phim/${slug}`, { timeout: 4000 });
    const movie = data?.movie;
    const epData = data?.episodes?.[0]?.server_data || [];

    if (!movie) return res.json({ meta: null });

    const videos = epData.map((ep, idx) => ({
      id: `kk:${slug}:${ep.slug}`,
      title: ep.name || `Tập ${idx + 1}`,
      season: 1,
      episode: idx + 1
    }));

    res.json({
      meta: {
        id: `kk:${slug}`,
        type,
        name: movie.name,
        poster: movie.poster_url,
        description: movie.content,
        genres: movie.category?.map(c => c.name) || [],
        videos
      }
    });
  } catch (e) {
    res.json({ meta: null });
  }
});

app.get('/stream/:type/:id.json', async (req, res) => {
  const { id } = req.params;
  if (!id.startsWith('kk:')) return res.json({ streams: [] });

  const [, slug, epSlug] = id.split(':');
  try {
    const { data } = await axios.get(`https://kkphim.com/phim/${slug}`, { timeout: 4000 });
    const servers = data?.episodes || [];
    let streams = [];

    servers.forEach(srv => {
      const ep = srv.server_data?.find(e => e.slug === epSlug) || srv.server_data?.[0];
      if (ep && ep.link_m3u8) {
        streams.push({
          name: `KKPhim [${srv.server_name}]`,
          title: ep.name || 'FHD',
          url: ep.link_m3u8
        });
      }
    });

    res.json({ streams });
  } catch (e) {
    res.json({ streams: [] });
  }
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`KKPhim Addon running on port ${PORT}`));
      
