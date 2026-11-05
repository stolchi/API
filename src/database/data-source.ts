import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, loadEnvFile } from './database.config.js';

// Entry point for the TypeORM CLI only.
loadEnvFile();

export default new DataSource(buildDataSourceOptions(process.env));
