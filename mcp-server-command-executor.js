#!/usr/bin/env node

const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');

class MCPServer {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        this.setupHandlers();
    }

    setupHandlers() {
        this.rl.on('line', (line) => {
            try {
                const request = JSON.parse(line);
                this.handleRequest(request);
            } catch (error) {
                this.sendError(-32700, 'Parse error', null);
            }
        });
    }

    async handleRequest(request) {
        try {
            switch (request.method) {
                case 'initialize':
                    this.sendResponse(request.id, {
                        protocolVersion: "2024-11-05",
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: "command-executor",
                            version: "1.0.0"
                        }
                    });
                    break;

                case 'tools/list':
                    this.sendResponse(request.id, {
                        tools: [
                            {
                                name: "execute_command",
                                description: "Execute a command in the system shell",
                                inputSchema: {
                                    type: "object",
                                    properties: {
                                        command: { type: "string", description: "Command to execute" },
                                        args: { type: "array", items: { type: "string" }, description: "Command arguments" },
                                        cwd: { type: "string", description: "Working directory" }
                                    },
                                    required: ["command"]
                                }
                            }
                        ]
                    });
                    break;

                case 'tools/call':
                    if (request.params.name === 'execute_command') {
                        await this.executeCommand(request.id, request.params.arguments);
                    } else {
                        this.sendError(request.id, -32601, 'Method not found');
                    }
                    break;

                case 'notifications/initialized':
                    // No response needed for notifications
                    break;

                default:
                    this.sendError(request.id, -32601, 'Method not found');
            }
        } catch (error) {
            this.sendError(request.id, -32603, 'Internal error', error.message);
        }
    }

    async executeCommand(id, args) {
        const defaultCwd = path.dirname(__filename);
        const { command, args: cmdArgs = [], cwd = defaultCwd } = args;

        return new Promise((resolve) => {
            const proc = spawn(command, cmdArgs, { cwd, shell: true });
            
            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                this.sendResponse(id, {
                    content: [
                        {
                            type: "text",
                            text: `Command: ${command} ${cmdArgs.join(' ')}\nExit Code: ${code}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
                        }
                    ]
                });
                resolve();
            });

            proc.on('error', (err) => {
                this.sendError(id, -32603, 'Command execution failed', err.message);
                resolve();
            });
        });
    }

    sendResponse(id, result) {
        const response = {
            jsonrpc: "2.0",
            id,
            result
        };
        console.log(JSON.stringify(response));
    }

    sendError(id, code, message, data = null) {
        const response = {
            jsonrpc: "2.0",
            id,
            error: { code, message, data }
        };
        console.log(JSON.stringify(response));
    }
}

const server = new MCPServer(); 
