#!/usr/bin/env bun
import { createProgram } from './src/cli/Commands';

const program = createProgram();

program.parse();
