import requests

@app.route('/download', methods=['POST'])
def download_audio():
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({'error': 'No URL provided'}), 400
    
    url = data.get('url')

    try:
        # Cobalt API request
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
        payload = {
            'url': url,
            'isAudioOnly': True,
            'filenamePattern': 'classic'
        }
        
        response = requests.post('https://api.cobalt.tools/api/json', json=payload, headers=headers)
        res_data = response.json()
        
        if 'url' in res_data:
            direct_url = res_data['url']
            title = "Mann Sutra Song"
            return jsonify({'direct_url': direct_url, 'title': title})
        else:
            return jsonify({'error': 'Could not fetch stream from Cobalt'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
