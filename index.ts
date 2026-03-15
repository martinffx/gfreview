#!/usr/bin/env node
import { createProgram } from './src/cli/Commands';

const program = createProgram();

program.parse();
