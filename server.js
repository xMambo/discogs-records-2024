import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Record from './models/record.js';

dotenv.config();

const app = express();
const PORT = 3000;

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB Atlas');
}).catch(err => {
  console.error('Failed to connect to MongoDB Atlas', err);
});

// Get the directory name of the current module file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DISCOGS_USER_TOKEN = process.env.DISCOGS_USER_TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const getMostViewedYouTubeLink = async (artist, albumTitle) => {
  const searchQuery = `${artist} ${albumTitle} full album`;
  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: searchQuery,
        key: YOUTUBE_API_KEY,
        maxResults: 1,
        order: 'viewCount'
      },
    });

    if (response.data.items && response.data.items.length > 0) {
      const video = response.data.items[0];
      return `https://www.youtube.com/embed/${video.id.videoId}`;
    } else {
      console.log(`No video found for ${searchQuery}`);
      return '';
    }
  } catch (error) {
    console.error('Error fetching YouTube video:', error);
    return '';
  }
};

app.get('/', async (req, res) => {
  try {
    const records = await Record.find().sort({ createdAt: -1 }).limit(10);
    res.render('index', { records, user: '' });
  } catch (error) {
    console.error('Error fetching records from MongoDB:', error);
    res.render('index', { records: [], user: '', error: 'Error fetching records from database.' });
  }
});

app.post('/search', async (req, res) => {
  const { artist } = req.body;
  try {
    console.log(`Searching Discogs for artist: ${artist}`);
    const response = await axios.get('https://api.discogs.com/database/search', {
      params: {
        q: artist,
        type: 'release',
        token: DISCOGS_USER_TOKEN,
      },
    });

    const records = await Promise.all(response.data.results.map(async record => {
      const youtubeLink = await getMostViewedYouTubeLink(artist, record.title);
      return {
        title: record.title,
        cover: record.cover_image || 'https://via.placeholder.com/150?text=No+Image',
        youtubeLink,
      };
    }));

    // Clear the existing records
    await Record.deleteMany({});

    // Insert new records
    await Record.insertMany(records);

    res.render('index', { records, user: '' });
  } catch (error) {
    console.error('Error fetching Discogs data:', error);
    res.render('index', { records: [], user: '', error: 'Error fetching data from Discogs.' });
  }
});

app.post('/collection', async (req, res) => {
  const { username } = req.body;
  try {
    console.log(`Fetching collection for user: ${username}`);
    let page = 1;
    let records = [];
    let totalRecords;

    do {
      console.log(`Fetching page ${page}`);
      const response = await axios.get(`https://api.discogs.com/users/${username}/collection/folders/0/releases`, {
        headers: {
          'User-Agent': 'MyDiscogsApp/1.0',
          Authorization: `Discogs token=${DISCOGS_USER_TOKEN}`,
        },
        params: {
          page,
          per_page: 50, // Adjusted for better performance
        },
      });

      totalRecords = response.data.pagination.items;
      console.log(`Fetched ${response.data.releases.length} records from page ${page}`);
      
      const newRecords = await Promise.all(response.data.releases.map(async release => {
        const youtubeLink = await getMostViewedYouTubeLink(release.basic_information.artists[0].name, release.basic_information.title);
        return {
          title: release.basic_information.title,
          cover: release.basic_information.cover_image || 'https://via.placeholder.com/150?text=No+Image',
          youtubeLink,
        };
      }));

      records = records.concat(newRecords);
      page++;
    } while (records.length < totalRecords);

    // Clear the existing records
    await Record.deleteMany({});

    // Insert new records
    await Record.insertMany(records);

    console.log(`Total records fetched: ${records.length}`);
    res.render('index', { records, user: username });
  } catch (error) {
    console.error('Error fetching user collection:', error);
    res.render('index', { records: [], user: username, error: 'Error fetching user collection from Discogs.' });
  }
});

// Add this snippet to check the database
app.get('/all-records', async (req, res) => {
  try {
    const records = await Record.find();
    res.json(records);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).send('Error fetching records from database.');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
