import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'*.spec.js',workers:1,reporter:'list',use:{headless:true}});
