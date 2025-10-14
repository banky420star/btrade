//+------------------------------------------------------------------+
//|                                                sb1_bridge.mq5 |
//|                        Copyright 2024, SB1 ALPHA Trading System |
//|                                             https://sb1-alpha.com |
//+------------------------------------------------------------------+
#property copyright "Copyright 2024, SB1 ALPHA Trading System"
#property link      "https://sb1-alpha.com"
#property version   "1.00"
#property strict

//--- Input parameters
input string BridgeHost = "localhost";
input int    BridgePort = 5010;
input int    UpdateInterval = 1000; // milliseconds
input bool   EnableTrading = true;
input double MaxRisk = 0.01; // 1% risk per trade

//--- Global variables
int bridge_socket = INVALID_HANDLE;
datetime last_update = 0;
string last_message = "";

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
    Print("SB1 ALPHA Bridge EA starting...");
    
    // Initialize bridge connection
    if(!InitializeBridge())
    {
        Print("Failed to initialize bridge connection");
        return INIT_FAILED;
    }
    
    Print("SB1 ALPHA Bridge EA initialized successfully");
    return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    Print("SB1 ALPHA Bridge EA stopping...");
    
    // Close bridge connection
    if(bridge_socket != INVALID_HANDLE)
    {
        SocketClose(bridge_socket);
        bridge_socket = INVALID_HANDLE;
    }
    
    Print("SB1 ALPHA Bridge EA stopped");
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
    // Check if it's time to update
    if(GetTickCount() - last_update < UpdateInterval)
        return;
    
    last_update = GetTickCount();
    
    // Send ping to bridge
    if(!SendPing())
    {
        Print("Failed to send ping to bridge");
        return;
    }
    
    // Check for new signals
    CheckForSignals();
}

//+------------------------------------------------------------------+
//| Initialize bridge connection                                     |
//+------------------------------------------------------------------+
bool InitializeBridge()
{
    bridge_socket = SocketCreate();
    if(bridge_socket == INVALID_HANDLE)
    {
        Print("Failed to create socket");
        return false;
    }
    
    if(!SocketConnect(bridge_socket, BridgeHost, BridgePort, 5000))
    {
        Print("Failed to connect to bridge server");
        SocketClose(bridge_socket);
        bridge_socket = INVALID_HANDLE;
        return false;
    }
    
    Print("Connected to bridge server at ", BridgeHost, ":", BridgePort);
    return true;
}

//+------------------------------------------------------------------+
//| Send ping to bridge                                              |
//+------------------------------------------------------------------+
bool SendPing()
{
    if(bridge_socket == INVALID_HANDLE)
        return false;
    
    string message = "{\"action\":\"ping\"}";
    
    if(!SocketSend(bridge_socket, message))
    {
        Print("Failed to send ping");
        return false;
    }
    
    return true;
}

//+------------------------------------------------------------------+
//| Check for new signals                                            |
//+------------------------------------------------------------------+
void CheckForSignals()
{
    if(bridge_socket == INVALID_HANDLE)
        return;
    
    // Send get balance request
    string message = "{\"action\":\"get_balance\"}";
    
    if(!SocketSend(bridge_socket, message))
    {
        Print("Failed to send get_balance request");
        return;
    }
    
    // Receive response
    string response = "";
    if(SocketReceive(bridge_socket, response, 1000) > 0)
    {
        ProcessResponse(response);
    }
}

//+------------------------------------------------------------------+
//| Process response from bridge                                     |
//+------------------------------------------------------------------+
void ProcessResponse(string response)
{
    if(response == last_message)
        return;
    
    last_message = response;
    Print("Received from bridge: ", response);
    
    // Parse JSON response (simplified)
    if(StringFind(response, "\"status\":\"ok\"") >= 0)
    {
        Print("Bridge communication successful");
    }
    else
    {
        Print("Bridge communication failed: ", response);
    }
}

//+------------------------------------------------------------------+
//| Place order via bridge                                           |
//+------------------------------------------------------------------+
bool PlaceOrder(string symbol, string side, double size, double price = 0)
{
    if(!EnableTrading)
    {
        Print("Trading is disabled");
        return false;
    }
    
    if(bridge_socket == INVALID_HANDLE)
        return false;
    
    string message = StringFormat(
        "{\"action\":\"place_order\",\"symbol\":\"%s\",\"side\":\"%s\",\"size\":%.2f,\"price\":%.5f}",
        symbol, side, size, price
    );
    
    if(!SocketSend(bridge_socket, message))
    {
        Print("Failed to send place_order request");
        return false;
    }
    
    // Receive response
    string response = "";
    if(SocketReceive(bridge_socket, response, 1000) > 0)
    {
        if(StringFind(response, "\"status\":\"ok\"") >= 0)
        {
            Print("Order placed successfully: ", side, " ", size, " ", symbol);
            return true;
        }
        else
        {
            Print("Order placement failed: ", response);
            return false;
        }
    }
    
    return false;
}

//+------------------------------------------------------------------+
//| Get account balance via bridge                                   |
//+------------------------------------------------------------------+
double GetAccountBalance()
{
    if(bridge_socket == INVALID_HANDLE)
        return 0.0;
    
    string message = "{\"action\":\"get_balance\"}";
    
    if(!SocketSend(bridge_socket, message))
        return 0.0;
    
    string response = "";
    if(SocketReceive(bridge_socket, response, 1000) > 0)
    {
        // Parse balance from response (simplified)
        int start = StringFind(response, "\"total_value\":");
        if(start >= 0)
        {
            start += 14; // Length of "\"total_value\":"
            int end = StringFind(response, ",", start);
            if(end < 0)
                end = StringFind(response, "}", start);
            
            if(end > start)
            {
                string balance_str = StringSubstr(response, start, end - start);
                return StringToDouble(balance_str);
            }
        }
    }
    
    return AccountBalance();
}

//+------------------------------------------------------------------+
//| Calculate position size based on risk                           |
//+------------------------------------------------------------------+
double CalculatePositionSize(double risk_percent)
{
    double balance = GetAccountBalance();
    double risk_amount = balance * risk_percent;
    
    // Get current price
    double price = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
    if(price <= 0)
        return 0.0;
    
    // Calculate position size
    double position_size = risk_amount / price;
    
    // Normalize position size
    double min_lot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
    double max_lot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
    double lot_step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
    
    position_size = MathMax(position_size, min_lot);
    position_size = MathMin(position_size, max_lot);
    position_size = NormalizeDouble(position_size / lot_step, 0) * lot_step;
    
    return position_size;
}

//+------------------------------------------------------------------+
//| Example trading logic (replace with your strategy)              |
//+------------------------------------------------------------------+
void ExecuteTradingLogic()
{
    // This is a placeholder - replace with your actual trading logic
    // Example: Simple moving average crossover
    
    double ma_fast = iMA(_Symbol, PERIOD_CURRENT, 5, 0, MODE_EMA, PRICE_CLOSE, 1);
    double ma_slow = iMA(_Symbol, PERIOD_CURRENT, 20, 0, MODE_EMA, PRICE_CLOSE, 1);
    
    if(ma_fast > ma_slow)
    {
        // Buy signal
        double position_size = CalculatePositionSize(MaxRisk);
        if(position_size > 0)
        {
            PlaceOrder(_Symbol, "buy", position_size, 0);
        }
    }
    else if(ma_fast < ma_slow)
    {
        // Sell signal
        double position_size = CalculatePositionSize(MaxRisk);
        if(position_size > 0)
        {
            PlaceOrder(_Symbol, "sell", position_size, 0);
        }
    }
}