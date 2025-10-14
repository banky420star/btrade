"""
MT5 Bridge Server for Exness/MT5 integration.
"""
import socket
import json
import threading
import time
from typing import Dict, Any, Optional
from datetime import datetime
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from core.util.logger import get_logger
from core.util.config import get_config

logger = get_logger(__name__)

class MT5BridgeServer:
    """MT5 Bridge Server for Exness/MT5 integration."""
    
    def __init__(self, host: str = 'localhost', port: int = 5010):
        self.host = host
        self.port = port
        self.socket = None
        self.running = False
        self.connections = []
        
        logger.info(f"MT5 Bridge Server initialized: {host}:{port}")
    
    def start(self):
        """Start the bridge server."""
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind((self.host, self.port))
            self.socket.listen(5)
            
            self.running = True
            logger.info(f"MT5 Bridge Server started on {self.host}:{self.port}")
            
            # Start accepting connections
            while self.running:
                try:
                    client_socket, address = self.socket.accept()
                    logger.info(f"MT5 client connected from {address}")
                    
                    # Handle client in separate thread
                    client_thread = threading.Thread(
                        target=self._handle_client,
                        args=(client_socket, address)
                    )
                    client_thread.daemon = True
                    client_thread.start()
                    
                except socket.error as e:
                    if self.running:
                        logger.error(f"Socket error: {e}")
                    break
                    
        except Exception as e:
            logger.error(f"Failed to start MT5 Bridge Server: {e}")
            raise
    
    def stop(self):
        """Stop the bridge server."""
        self.running = False
        if self.socket:
            self.socket.close()
        logger.info("MT5 Bridge Server stopped")
    
    def _handle_client(self, client_socket: socket.socket, address: tuple):
        """Handle client connection."""
        try:
            while self.running:
                # Receive data from MT5
                data = client_socket.recv(1024)
                if not data:
                    break
                
                try:
                    message = json.loads(data.decode('utf-8'))
                    logger.info(f"Received from MT5: {message}")
                    
                    # Process message
                    response = self._process_message(message)
                    
                    # Send response back to MT5
                    response_data = json.dumps(response).encode('utf-8')
                    client_socket.send(response_data)
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON from MT5: {e}")
                    response = {'error': 'Invalid JSON format'}
                    client_socket.send(json.dumps(response).encode('utf-8'))
                
        except Exception as e:
            logger.error(f"Error handling MT5 client {address}: {e}")
        finally:
            client_socket.close()
            logger.info(f"MT5 client {address} disconnected")
    
    def _process_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Process message from MT5."""
        try:
            action = message.get('action')
            
            if action == 'ping':
                return {'status': 'ok', 'timestamp': datetime.now().isoformat()}
            
            elif action == 'place_order':
                return self._handle_place_order(message)
            
            elif action == 'get_balance':
                return self._handle_get_balance()
            
            elif action == 'get_positions':
                return self._handle_get_positions()
            
            elif action == 'get_trades':
                return self._handle_get_trades(message)
            
            else:
                return {'error': f'Unknown action: {action}'}
                
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            return {'error': str(e)}
    
    def _handle_place_order(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Handle place order request."""
        try:
            symbol = message.get('symbol')
            side = message.get('side')
            size = message.get('size')
            price = message.get('price')
            
            # Validate parameters
            if not all([symbol, side, size]):
                return {'error': 'Missing required parameters'}
            
            if side not in ['buy', 'sell']:
                return {'error': 'Invalid side'}
            
            # Simulate order placement
            order_id = f"mt5_{int(time.time() * 1000)}"
            
            # Log order
            logger.info(f"MT5 Order: {side} {size} {symbol} at {price or 'market'}")
            
            return {
                'status': 'ok',
                'order_id': order_id,
                'message': 'Order placed successfully'
            }
            
        except Exception as e:
            logger.error(f"Error handling place order: {e}")
            return {'error': str(e)}
    
    def _handle_get_balance(self) -> Dict[str, Any]:
        """Handle get balance request."""
        try:
            # Simulate balance data
            balance = {
                'cash': 10000.0,
                'total_value': 10000.0,
                'margin': 0.0,
                'unrealized_pnl': 0.0
            }
            
            return {
                'status': 'ok',
                'balance': balance
            }
            
        except Exception as e:
            logger.error(f"Error handling get balance: {e}")
            return {'error': str(e)}
    
    def _handle_get_positions(self) -> Dict[str, Any]:
        """Handle get positions request."""
        try:
            # Simulate positions data
            positions = {}
            
            return {
                'status': 'ok',
                'positions': positions
            }
            
        except Exception as e:
            logger.error(f"Error handling get positions: {e}")
            return {'error': str(e)}
    
    def _handle_get_trades(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get trades request."""
        try:
            limit = message.get('limit', 50)
            
            # Simulate trades data
            trades = []
            
            return {
                'status': 'ok',
                'trades': trades,
                'count': len(trades)
            }
            
        except Exception as e:
            logger.error(f"Error handling get trades: {e}")
            return {'error': str(e)}

def main():
    """Main bridge server script."""
    import argparse
    
    parser = argparse.ArgumentParser(description='MT5 Bridge Server')
    parser.add_argument('--host', type=str, default='localhost', help='Host to bind to')
    parser.add_argument('--port', type=int, default=5010, help='Port to bind to')
    
    args = parser.parse_args()
    
    # Create and start server
    server = MT5BridgeServer(args.host, args.port)
    
    try:
        server.start()
    except KeyboardInterrupt:
        logger.info("Shutting down MT5 Bridge Server...")
    finally:
        server.stop()

if __name__ == "__main__":
    main()