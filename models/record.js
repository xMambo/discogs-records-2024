import mongoose from 'mongoose';

const recordSchema = new mongoose.Schema({
  title: String,
  cover: String,
  youtubeLink: String,
  createdAt: { type: Date, default: Date.now },
});

const Record = mongoose.model('Record', recordSchema);

export default Record;
