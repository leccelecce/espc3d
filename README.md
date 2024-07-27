# This is a fork

This repo is a fork of the excellent https://github.com/hdurdle/espc3d, tweaked for personal use.

1. Detected devices now have labels for name, % confidence and # of fixes
2. Devices are not displayed if the confidence is <= 1 (normally means too few fixes to be remotely accurate)
3. Nodes are displayed along with their name, and online/offline status
4. Floors are lightly shaded for improving the display of multi-floor buildings
5. Bloom effect slightly redued
6. Various other minor tweaks

TODO: 
1. fix limit of 3 tracked devices (just need more colours, or use a single colour)
2. enable manually triggered or automated refresh of map/node layout from Companion
3. lookup friendly device names if set (available on mqtt)
4. explore showing a recent path of device movement
5. add GUI for live view changes
6. externalise more settings

![Screenshot](https://github.com/leccelecce/espc3d/blob/fd5e1d89452360631cc0b065ca4cf0a92218b327/screenshot.png)

# ESPresense-companion 3D

This app pulls data from the excellent [ESPresense-companion](https://github.com/ESPresense/ESPresense-companion) and renders a fully rotatable, zoomable 3D model complete with objects representing where your objects are located.

https://github.com/hdurdle/espc3d/assets/4083861/1ccdaf76-23c7-48ed-a2d3-bef51fb2ff82

I'd never looked at Threejs before this, so you'll forgive my exuberant bloom settings!

### A note on credentials

My first version of this ran entirely in the browser - and used websockets to grab the mqtt data. Unfortunately that meant that the mqtt credentials were available in the clear in the web app (since they can be retreived from the esp-companion API). So this version separates the business of talking to the API and the mqtt server, and allows the front end to consume only the data it needs to operate.

The nodeJS app first connects to the espresense API to get the config. This includes the mqtt server and credentials, plus the config of your floorplan - including boundary heights. These are passed to the front end to allow Threejs to build the model. The nodeJS server connects to the mqtt server and receives events when tracking data changes. Every 5 seconds these are requested by the front end to update the tracking spheres in the model.

## How to Run

### Node

Make sure to set the environment variables:

```
      ESPC3D_PORT: 3001
      ESPC3D_API: "http://<ip>:<port>/api"
```

Set `ESPC3D_PORT` for the port to run the app on, and `ESPC3D_API` for the full URL for the ESPresense-companion API. If you're running that in Docker, it'll be on port 8267. I don't run it as an HA addon so can't speak to connecting to that.

Extract the repo and run `npm install`, set the environment variables and then `npm start`.

### Docker

Copy the entire repo to a directory and put this in your docker-compose.yaml. The context under build should point to the directory with the Dockerfile and other code in.

```yaml
version: "3.3"
services:
  espc3d:
    build:
      context: "./espc3d/"
    container_name: espc3d
    restart: unless-stopped
    expose:
      - 3001
    environment:
      ESPC3D_PORT: 3001
      ESPC3D_API: "http://<ip>:<port>/api"
```
