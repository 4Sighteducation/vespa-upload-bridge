<!DOCTYPE html>
<html>
<head>
    <title>Account Management Debug Test</title>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
</head>
<body>
    <h1>Account Management API Debug Test</h1>
    
    <div style="margin: 20px;">
        <label>Staff ID: 
            <input type="text" id="staffId" value="6470aceaf967a506e5149ea7" style="width: 300px;">
        </label>
        <br><br>
        <label>Customer ID: 
            <input type="text" id="customerId" value="63bd78f03bba090011f1600b" style="width: 300px;">
        </label>
        <br><br>
        <button onclick="testGetLinkedStudents()">Test Get Linked Students</button>
    </div>
    
    <div id="results" style="margin: 20px; padding: 20px; border: 1px solid #ccc;">
        <h3>Results:</h3>
        <pre id="output"></pre>
    </div>

    <script>
        async function testGetLinkedStudents() {
            const staffId = document.getElementById('staffId').value;
            const customerId = document.getElementById('customerId').value;
            const output = document.getElementById('output');
            
            output.textContent = 'Loading...';
            
            try {
                const response = await $.ajax({
                    url: `https://vespa-upload-api-07e11c285370.herokuapp.com/api/account/get-linked-students?staffId=${staffId}&customerId=${customerId}`,
                    type: 'GET',
                    xhrFields: { withCredentials: true }
                });
                
                output.textContent = JSON.stringify(response, null, 2);
                
                // Log specific structure details
                console.log('Response structure:');
                console.log('- success:', response.success);
                console.log('- data:', response.data);
                console.log('- roles:', response.roles);
                console.log('- message:', response.message);
                
                if (response.data && response.data.length > 0) {
                    console.log('First student structure:', response.data[0]);
                    console.log('First student connections:', response.data[0].connections);
                }
                
                if (response.roles) {
                    console.log('Roles structure:', Object.keys(response.roles));
                }
                
            } catch (error) {
                output.textContent = `Error: ${error.message}\n\nFull error: ${JSON.stringify(error, null, 2)}`;
                console.error('Error:', error);
            }
        }
    </script>
</body>
</html> 
